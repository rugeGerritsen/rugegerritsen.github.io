"""Cherry-pick commits from upstream to downstream
"""

import os
import argparse
import pathlib
import logging
import typing
import datetime
import git

USER_REMOTE = 'user_remote'

def clone_repo_with_remote(local_dir: pathlib.Path,
                           repo_url: str,
                           remote_name: str) -> git.Repo:
    """Clone repo with corresponding remote

    Args:
        local_dir (pathlib.Path): The dir where to clone the repo
        repo_url (str): Repo URL
        remote_name (str): Local remote name

    Returns:
        git.Repo: The repo object
    """
    if not os.path.exists(local_dir):
        logging.info("Cloning repository into %s...", local_dir)
        repo = git.Repo.clone_from(repo_url, local_dir)
    else:
        # Initialize repo from folder.
        # If this fails, the folder is used by something else.
        # We do not handle that case.
        repo = git.Repo(local_dir)

        repo_add_remote(repo, repo_url, remote_name)

    return repo

def repo_add_remote(repo: git.Repo,
                    repo_url: str,
                    remote_name: str):
    """Adds a remote to an existing repo

    Args:
        repo (git.Repo): The repo object
        repo_url (str): The repo url
        remote_name (str): The local remote name
    """
    if remote_name in repo.remotes:
        # We do not handle the case where the remote is pointing to
        # a different url.
        assert repo.remotes[remote_name].url == repo_url
    else:
        logging.info("Adding remote named %s pointing to %s...",
                     remote_name, repo_url)
        repo.create_remote(remote_name, repo_url)
        repo.remotes[remote_name].fetch()

    return repo

def fetch_repos(args) -> git.Repo:
    """ 
    Fetches the repos need to cherry-pick commits
    
    Args:
        args: The arguments sent to the script

    Returns:
        git.Repo: The repo object
    """
    
    repo = clone_repo_with_remote(
        local_dir=args.clone_dir,
        repo_url='https://github.com/' + args.upstream,
        remote_name=args.upstream_remote)

    repo_add_remote(
        repo=repo,
        repo_url='https://github.com/' + args.downstream,
        remote_name=args.downstream_remote)
    
    forked_downstream = '/'.join([args.user, args.downstream.split('/')[-1]])

    repo_add_remote(
        repo=repo,
        repo_url='https://' 'github.com/' + forked_downstream,
        remote_name=USER_REMOTE)

    if args.refetch_remote:
        for remote in repo.remotes:
            logging.info("Refetching changes for remote %s", remote)
            remote.fetch()
            
    return repo

def get_commits_from_input(repo: git.Repo,
                           upstream_commits: str) -> typing.List[git.Commit]:
    refs = [ref.strip() for ref in upstream_commits.split(';')]

    try:
        return [repo.commit(ref) for ref in refs]
    except Exception as e:
        logging.error("Invalid commit provided: %s", e)
        raise e

def main():
    """Main function of this script"""
    logging.getLogger().setLevel('INFO')

    parser = argparse.ArgumentParser(
        prog="Cherry-pick commits from upstream",
    )
    parser.add_argument('--user', required=True)
    parser.add_argument('--upstream', required=True)
    parser.add_argument('--upstream-remote',
                        default='origin')
    parser.add_argument('--downstream', required=True)
    parser.add_argument('--downstream-remote',
                        default='downstream')
    parser.add_argument('--commits', required=True)
    parser.add_argument('--new-commit-title-prefix', default='')
    parser.add_argument('--clone-dir',
                        type=pathlib.Path,
                        default='repo')
    parser.add_argument('--refetch-remote',
                        default=False,
                        action='store_true')
    args = parser.parse_args()
    
    cherry_pick_branch = 'cherry_pick_' + str(datetime.datetime.now().strftime("%Y_%m_%d__%H_%M"))
    print(cherry_pick_branch)

    repo = fetch_repos(args)

    commits = get_commits_from_input(repo,
                                     args.commits)

    first_commit = repo.remotes[args.downstream_remote].refs['main'].commit

    repo.head.reference = repo.create_head(path=cherry_pick_branch, commit=first_commit, force=True)
    repo.head.reset(index=True, working_tree=True)
    
    for commit in commits:
        # May fail in case of conflicts
        repo.git.cherry_pick(commit, '-x')
        
        # Replace commit title
        new_commit_message = ''.join([args.new_commit_title_prefix,
                                      commit.message,
                                      f'(cherry picked from commit {commit})'])
        repo.git.commit('--amend', '-m', new_commit_message)

if __name__ == '__main__':
    main()
