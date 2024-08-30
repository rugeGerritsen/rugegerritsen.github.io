"""Obtain fork synchronization data

This script stores fork synchronization data in a json format.
"""

import os
import sys
import time
import argparse
import json
import re
import typing
import pathlib
import logging
import git

class CommitRepr:
    """Local representation of a commit
    """

    RE_UPSTREAM_PR = \
        r'^Upstream PR: (?P<upstream_pr>.+)'
    RE_UPSTREAM_SHA = \
        r'^\(cherry picked from commit (?P<upstream_sha>[0-9a-f]+)\)'

    RE_OBJ_UPSTREAM_PR_OR_SHA = \
        re.compile('(' + RE_UPSTREAM_PR + ')|(' + RE_UPSTREAM_SHA + ')', re.MULTILINE)

    def __init__(self,
                 commit: git.Commit,
                 parse_message_for_upstream_info=False,
                 downstream_sha = None):
        self._commit = commit
        self._upstream_sha = None
        self._upstream_pr = None
        self._downstream_sha = downstream_sha

        if parse_message_for_upstream_info:
            self._set_upstream_pr_or_sha()

    @property
    def sha(self) -> str:
        """Get the SHA of the commit"""
        return str(self._commit)

    @property
    def upstream_sha(self) -> str:
        """Returns the upstream SHA"""
        return self._upstream_sha

    @property
    def upstream_pr(self) -> str:
        """Returns the upstream PR link"""
        return self._upstream_pr

    @property
    def downstream_sha(self) -> str:
        """Returns the downstream SHA"""
        return self._downstream_sha

    def to_dict(self) -> dict:
        """Convert commit to dictionary representation

        The returned data formatted in the way data will be stored.

        Returns:
            dict: The dictionary representation
        """
        representation = {
                'sha': str(self._commit),
                'seconds_since_epoch': self._commit.authored_date,
                'author': self._commit.author.name,
                'title': self._commit.summary
            }
        if self._upstream_pr:
            representation['upstream_pr'] = self._upstream_pr
        if self._upstream_sha:
            representation['upstream_sha'] = self._upstream_sha
        if self._downstream_sha:
            representation['downstream_sha'] = self._downstream_sha

        return representation

    def _set_upstream_pr_or_sha(self):
        """Obtains upstream references based upon the commit message"""

        if self._commit.summary.startswith("Revert"):
            return
        search_result = \
            self.RE_OBJ_UPSTREAM_PR_OR_SHA.search(self._commit.message)

        if search_result:
            search_result_dict = search_result.groupdict()
            self._upstream_sha = search_result_dict.get('upstream_sha', None)
            self._upstream_pr = search_result_dict.get('upstream_pr', None)

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

def get_fork_sync_data(upstream_commits: typing.Iterator[git.Commit],
                       downstream_commits: typing.Iterator[git.Commit]) -> dict:
    """Obtain synchronization info for upstream and downstream commits
    
    The returned synchronization info is represented as a dictionary
    containing the CommitRepr.do_dict() representation of all the
    upstream and downstream commits. These commits have been annotated
    with their <optional> upstream/downstream shas or PRs.
    
    Args:
        upstream_commits: Upstream commits
        downstream_commits Downstream commits

    Returns:
        dict: The synchronization data
    """
    data = {}

    # Create a dictionary mapping downstream to upstream commits.
    # This will be used when mapping upstream to downstream commits.
    upstream_commits_with_downstream = {}

    data['downstream_commits'] = []
    for commit in downstream_commits:
        item = CommitRepr(commit, parse_message_for_upstream_info=True)
        data['downstream_commits'].append(item.to_dict())
        if item.upstream_sha:
            upstream_commits_with_downstream[item.upstream_sha] = item.sha

    data['upstream_commits'] = []
    for commit in upstream_commits:
        downstream_sha = upstream_commits_with_downstream.get(str(commit), None)
        item = CommitRepr(commit, downstream_sha=downstream_sha)
        data['upstream_commits'].append(item.to_dict())

    return data

def main():
    """Main function of this script"""
    logging.getLogger().setLevel('INFO')

    parser = argparse.ArgumentParser(
        prog="Get commit data",
        description="Options commit data for commits since a common merge base"
    )
    parser.add_argument('-o',
                        '--output-file',
                        type=argparse.FileType('w'),
                        default=sys.stdout)
    parser.add_argument('--upstream-url',
                        default="https://github.com/zephyrproject-rtos/zephyr")
    parser.add_argument('--upstream-rev',
                        default='main')
    parser.add_argument('--upstream-remote',
                        default='origin')
    parser.add_argument('--downstream-url',
                        default="https://github.com/nrfconnect/sdk-zephyr")
    parser.add_argument('--downstream-rev',
                        default='main')
    parser.add_argument('--downstream-remote',
                        default='downstream')
    parser.add_argument('--clone-dir',
                        type=pathlib.Path,
                        default='repo')
    parser.add_argument('--refetch-remote',
                        default=False,
                        action='store_true')
    args = parser.parse_args()

    repo = clone_repo_with_remote(
        local_dir=args.clone_dir,
        repo_url=args.upstream_url,
        remote_name=args.upstream_remote)

    repo_add_remote(
        repo=repo,
        repo_url=args.downstream_url,
        remote_name=args.downstream_remote)

    if args.refetch_remote:
        logging.info("Fetching changes upstream")
        repo.remotes[args.upstream_remote].fetch()
        logging.info("Fetch changes downstream")
        repo.remotes[args.downstream_remote].fetch()

    merge_base = repo.merge_base(
        f'{args.upstream_remote}/{args.upstream_rev}',
        f'{args.downstream_remote}/{args.downstream_rev}')[0]

    output_data = {
        'meta': {
            'upstream_url': args.upstream_url,
            'upstream_rev': args.upstream_rev,
            'downstream_url': args.downstream_url,
            'downstream_rev': args.downstream_rev,
            'seconds_since_epoch': int(time.time()),
        },
        'merge_base': CommitRepr(merge_base).to_dict()
    }

    upstream_commits = repo.iter_commits(
        f'{merge_base}..{args.upstream_remote}/{args.upstream_rev}')
    downstream_commits = repo.iter_commits(
        f'{merge_base}..{args.downstream_remote}/{args.downstream_rev}')

    output_data.update(
        get_fork_sync_data(upstream_commits=upstream_commits,
                           downstream_commits=downstream_commits))

    args.output_file.write(json.dumps(output_data))

if __name__ == '__main__':
    main()
