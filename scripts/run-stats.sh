#!/bin/bash
set -o pipefail
cd /home/claude/physique
unzip -p /mnt/user-data/uploads/FoodData_Central_branded_food_json_2026-04-30.zip | node --max-old-space-size=2048 scripts/food-stats.mjs > raw/branded-stats.json 2> raw/branded-stats.log
