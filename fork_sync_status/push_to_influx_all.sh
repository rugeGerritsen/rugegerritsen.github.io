#!/usr/bin/env bash
set -e

mkdir -p fork_sync_status/temp_dir_not_in_git

cp fork_sync_status/push_to_influx_all.sh fork_sync_status/temp_dir_not_in_git/
cp fork_sync_status/push_to_influx_if_autocommitted.sh fork_sync_status/temp_dir_not_in_git/
cp fork_sync_status/push_to_influx.py fork_sync_status/temp_dir_not_in_git/

git rebase -i 472478d --exec "cd fork_sync_status/temp_dir_not_in_git && ./push_to_influx_if_autocommitted.sh"
