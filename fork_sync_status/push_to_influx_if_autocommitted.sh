#!/usr/bin/env bash

title=$(git show --oneline -s HEAD --format="%s")
if [[ $title =~ ^\(auto.* ]]
then
    python3 push_to_influx.py --input-file ../data/data.json
else
    echo "Skipping commit with title: $title"
fi 
