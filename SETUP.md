# Daily Budget: Setup Guide

Everything here is free. You can do every step from your iPhone.

## What's in the folder
- index.html: the app
- engine.js: the budget math
- manifest.json, sw.js, icon-180.png, icon-512.png: make it installable, work offline, and give it an icon
- test.js: the automated checks for the budget rules (not needed on your phone, safe to upload or skip)

## Step 1: Put the files on your phone
1. Download daily-budget.zip from the chat and save it to the Files app.
2. In Files, tap the zip once. It unzips into a folder called daily-budget.

## Step 2: Publish free on GitHub Pages
1. Go to github.com in Safari and create a free account. Your username becomes part of your app's web address.
2. Tap the + (top right) and choose New repository.
3. Name it daily-budget. Set it to Public (free accounts need Public for Pages). Check "Add a README file". Tap Create repository.
   Note: Public means the app code is visible. Your spending data never leaves your phone, so no money data is ever in GitHub.
4. In the new repository, tap Add file, then Upload files. Choose the files from the daily-budget folder in Files (select all of them). Tap Commit changes.
5. Tap Settings (in the repository), then Pages in the menu.
6. Under Build and deployment, set Source to "Deploy from a branch", Branch to main, folder to / (root). Tap Save.
7. Wait about 1 to 2 minutes. Your app is live at:
   https://YOUR-USERNAME.github.io/daily-budget/

## Step 3: Add it to your Home Screen
1. Open that address in Safari.
2. Tap the Share button, then Add to Home Screen, then Add.
3. Open it from the new icon. It asks for your daily budget, daily reset time, pay period start date, and pay period reset date and time. Tap Save.

## Step 4: Logging
Open the app, type the amount on the number pad (1250 = $12.50), tap Log spend. Tap + Note first if you want a note. Tap any entry under Today to edit or delete it.

## Step 5 (optional): Siri / Action Button Shortcut

Important limitation to know first: iPhone keeps the Home Screen app's data separate from Safari's data. A Shortcut can only open the app's address in Safari, not the Home Screen app, so spends logged by the Shortcut land in Safari's copy and will not show up in the Home Screen app. You have two ways to handle this:

- Option A (recommended to start): Use the Home Screen app and its number pad only. Skip the Shortcut. This keeps your data in the Home Screen app, which iPhone protects from automatic cleanup.
- Option B: Use the app only through Safari (open the address in Safari, or, if your iPhone shows an "Open as Web App" switch when you tap Add to Home Screen, turn it off so the icon opens in Safari). Then the Shortcut and the app share the same data. Tradeoff: Safari may clear a website's saved data if you go about a week of using Safari without opening the app, and there is no backup, so daily use matters.

To build the Shortcut (Option B):
1. Open the Shortcuts app, tap +.
2. Add action "Ask for Input". Set Input Type to Number. Set the prompt to "Amount spent".
3. Add action "URL". Type: https://YOUR-USERNAME.github.io/daily-budget/?add= then tap the variable button and insert "Provided Input" at the end.
4. Add action "Open URLs".
5. Name the shortcut "Log Spend" and tap Done.
6. Siri: say "Hey Siri, Log Spend". Action Button: Settings, Action Button, choose Shortcut, pick Log Spend. Home Screen: in the shortcut, tap the share icon, then Add to Home Screen.

## How the rules work
- Each day runs from your daily reset time to the next (default 3:00 a.m. Pacific).
- Leftover money and overspending both carry to the next day.
- At the pay period reset, overspending carries into the new period; leftover money is wiped to $0.
- Pay periods repeat every 14 days from the reset date you set.
- Changing the daily budget: "This pay period only" applies from the next daily reset through the end of the current pay period, then goes back to your previous amount. "From now on" keeps the new amount going forward. Today's amount is never changed after the fact.
- Changing the daily reset time or pay period dates applies from now forward. Past days are never recalculated.

## Test checklist (do this on day one)
1. Set a $50 budget. Remaining today shows $50.00.
2. Log $12.50. Remaining shows $37.50, and the entry shows under Today.
3. Tap the entry, change it to $10.00. Remaining shows $40.00.
4. Delete it. Remaining goes back to $50.00.
5. After the next daily reset, Remaining shows today's budget plus yesterday's leftover (or minus yesterday's overspend), and "Carried in" shows that amount.
6. After a pay period reset with money left over, Remaining starts the new period at just one day's budget. After one with overspending, the negative amount is still there.

These same rules were also verified with 28 automated checks in test.js, including daylight saving time changes.
