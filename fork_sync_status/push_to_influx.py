import datetime
import argparse
import logging
import json

import influxdb_client, os, time
from influxdb_client import InfluxDBClient, Point, WritePrecision
from influxdb_client.client.write_api import SYNCHRONOUS

token = os.environ.get("INFLUXDB_TOKEN")
org = "my-org"
url = "https://ci-health-influxdb.nordicsemi.no"
bucket="ruge"

def get_entry(fork_sync_data):
    time = str(datetime.datetime.fromtimestamp(fork_sync_data['meta']['authored_seconds_since_epoch'],
                                               tz=datetime.timezone.utc))

    def is_non_reverted_noup_commit(item):
        if not item['title'].startswith('[nrf noup]'):
            return False

        return item.get('reverted_by_sha', None) is None

    def is_non_reverted_fromtree_commit(item):
        if not item['title'].startswith('[nrf fromtree]'):
            return False

        return item.get('reverted_by_sha', None) is None

    def is_non_reverted_fromlist_commit(item):
        if not item['title'].startswith('[nrf fromlist]'):
            return False

        return item.get('reverted_by_sha', None) is None

    def is_likely_merged_fromlist_commit(item):
        if not item['title'].startswith('[nrf fromlist]'):
            return False

        if item.get('reverted_by_sha', None):
            return False
        
        return item.get('upstream_sha_guess', None)

    def upstream_only_commit(item):
        return not item.get('downstream_sha', None) and not item.get('downstream_sha_guess', None)

    def bluetooth_upstream_only_commit(item):
        if item.get('downstream_sha', None):
            return False
        
        if item.get('downstream_sha_guess', None):
            return False
        
        if item['title'].startswith('Bluetooth') or item['title'].startswith('bluetooth'):
            return True
    
        return False

    def get_len_from_list(filter_func, the_list):
        return len(list(filter(filter_func, the_list)))

    return {
        'measurement': 'zephyr',
        'tags': {
            "mode": "measurement",
        },
        'time': time,
        'fields': {
            'Commits upstream after upmerge': len(fork_sync_data['upstream_commits']),
            'Commits downstream after upmerge': len(fork_sync_data['downstream_commits']),
            'Downstream noup commits': get_len_from_list(is_non_reverted_noup_commit, fork_sync_data['downstream_commits']),
            'Downstream fromtree commits': get_len_from_list(is_non_reverted_fromtree_commit, fork_sync_data['downstream_commits']),
            'Downstream fromtree commits': get_len_from_list(is_non_reverted_fromlist_commit, fork_sync_data['downstream_commits']),
            'Downstream fromlist commits likely merged': get_len_from_list(is_likely_merged_fromlist_commit, fork_sync_data['downstream_commits']),
            'Commits upstream only': get_len_from_list(upstream_only_commit, fork_sync_data['upstream_commits']),
            'Bluetooth commits upstream only': get_len_from_list(bluetooth_upstream_only_commit, fork_sync_data['upstream_commits']),
        }
    }

def push_entry_to_influx(entry):
    with influxdb_client.InfluxDBClient(url=url, token=token, org=org) as client:
        with client.write_api(write_options=SYNCHRONOUS) as api:
            api.write(bucket=bucket, org="my-org", record=entry)

def main():
    parser = argparse.ArgumentParser(
        prog="Push fork sync data to influxDb"
    )
    parser.add_argument('--input-file',
                        type=argparse.FileType('r'))
    parser.add_argument('--dry-run', default=False, action='store_true')

    args = parser.parse_args()

    fork_sync_data = json.load(args.input_file)
    entry = get_entry(fork_sync_data)

    if args.dry_run:
        print(entry)
    else:
        push_entry_to_influx(entry)

if __name__ == '__main__':
    main()
