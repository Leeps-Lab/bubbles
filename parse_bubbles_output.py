#!/usr/bin/env python

# this program reformats raw redwood output from bubbles / BJ pricing
# to use, just provide redwood output files as arguments

import sys, csv, re, json
from collections import defaultdict

for filename in sys.argv[1:]:
    events_by_period_then_group = defaultdict(lambda: defaultdict(lambda: []))
    players = set()
    with open(filename, 'rb') as infile:
        reader = csv.DictReader(infile)
        for row in reader:
            row['Period'] = int(row['Period'])
            row['Group'] = int(row['Group'])
            row['ClientTime'] = int(row['ClientTime'])
            
            try:
                row['Value'] = json.loads(row['Value'])
            except:
                pass
            
            events_by_period_then_group[row['Period']][row['Group']].append(row)

            try:
                players.add(int(row['Sender']))
            except:
                pass

    header = ["time", "period", "group"]

    for player in players:
        header.append("action_p" + str(player))
        header.append("subperiod_number_p" + str(player))
        header.append("rank_p" + str(player))
        header.append("payoff_p" + str(player))

    outfilename = filename.rsplit('.', 1)[0] + "_parsed.csv"

    with open(outfilename, 'w') as outfile:
        writer = csv.DictWriter(outfile, fieldnames=header)
        writer.writeheader()

        for period, period_events in events_by_period_then_group.items():
            if period == 0:
                continue

            for group, group_events in period_events.items():
                if group == 0:
                    continue

                on_load_event = [x for x in group_events if isinstance(x['Value'], str) and x['Value'].startswith('_on_load')][-1]
                state_events = [x for x in group_events if x['Key'] == 'state']

                for event in state_events:
                    state = event['Value']['state']

                    row = {}
                    row['time'] = event['ClientTime'] - on_load_event['ClientTime']
                    row['period'] = event['Period']
                    row['group'] = event['Group']

                    for entry in state:
                        player = entry['subjectid']

                        row['action_p' + player] = entry['action']
                        row['subperiod_number_p' + player] = entry['subperiodNumber']
                        row['rank_p' + player] = entry['rank']
                        row['payoff_p' + player] = entry['payoff']

                    writer.writerow(row)
