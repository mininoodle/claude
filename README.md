# Study site

A single-page study site with subject tabs (Today, Physics, Biology, Chemistry, Math, Language Arts).

Open `index.html` in a browser. Everything is in that one file: styles, scripts and lesson content.

## Contents

| Tab | Units |
|---|---|
| Today | Daily 5-question challenge, weekly goal, level, progress map, achievements |
| Physics | Momentum, Forces and fields |
| Biology | Nervous system, Senses |
| Chemistry | Equilibrium |
| Math | Limits and rates of change |
| Language Arts | Prose analysis: diction, syntax, tone, point of view |
| Social Studies | Ideologies and identity (Related Issue 1): ideology, democratic primer, the American political system, translating the will of the people, classical liberalism, thinkers and liberal democracy |
| Test | Build a test from any subjects and units, with optional confidence ratings and a revision section |

## Features

- Lesson notes, interactive figures and quizzes with hints
- Math: step-by-step worked examples in every lesson (17 question types). Each one gives the method, an example to go through one step at a time with the reason for each step, a common mistake, and a "Your turn" question with new numbers that you can check, with hints that show the solution one step at a time
- Mastery levels for each lesson (Not started, Learning, Practised, Mastered)
- Spaced repetition, review tests and a timed unit exam, drawn from a separate review bank of 541 diploma and IB level questions that are not in the lessons (multi-step calculations, data and graph reading, error analysis, source and passage analysis)
- Boss round, challenge problems, speed rounds and an answer combo
- Achievements: 29 achievements in six categories (Mastery, Practice, Consistency, Challenge, Explorer, Secret), most with Bronze to Diamond tiers (98 tiers), each with a progress bar, XP for every tier, titles from Newcomer to Grandmaster, a closest-to-unlock list, and a celebration card for each new tier. Badges earned before the achievements update are carried over once (their dates are kept) and the tiers already earned from your history appear without a celebration for each one.
- Light and dark mode
- Answers are saved in the browser, with an option to clear each section
- Optional Google sign-in to sync progress across devices (see below)

## Note on Language Arts content

The prose analysis unit is based on the Bentz / Lit & More prose lessons. The explanations are rewritten, and the quotations are short excerpts for study.

## Cross-device sync (Google sign-in)

By default all progress stays in the browser of one device. To sync progress across devices, the site uses Firebase (Google sign-in plus a Firestore database). The free plan is more than enough for one person. Set it up once:

1. Go to <https://console.firebase.google.com>, select **Add project**, give it a name and finish the wizard (Analytics can stay off).
2. In the project, open **Build > Authentication > Get started**, then the **Sign-in method** tab. Enable **Google**, choose a support email and save.
3. Still in Authentication, open **Settings > Authorized domains** and add the domain where the site is hosted, for example `mininoodle.github.io`. (`localhost` is already there.)
4. Open **Build > Firestore Database > Create database**. Choose a location near you and start in **production mode**.
5. In Firestore open the **Rules** tab, replace the rules with the text below and publish:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{uid}/{document=**} {
         allow read, write: if request.auth != null && request.auth.uid == uid;
       }
     }
   }
   ```

   Each signed-in user can read and write only their own documents.
6. Open **Project settings** (the gear icon) **> General > Your apps**, select the web icon (`</>`), register the app (hosting is not needed) and copy the `firebaseConfig` object.
7. In `index.html`, near the top of the script, replace `const FIREBASE_CONFIG=null;` with that object, for example:

   ```js
   const FIREBASE_CONFIG={apiKey:'AIza...',authDomain:'my-project.firebaseapp.com',projectId:'my-project',appId:'1:1234:web:abcd'};
   ```

   The config values are not secrets. The rules above are what protect the data.
8. Commit and push. Open the site, select the account button at the right end of the top bar, and sign in with Google. Do the same on each other device.

How it works: progress is kept on the device as before and also written to `users/{uid}/progress/main` in Firestore. On sign-in the two are merged and the newest entry for each answer wins. Changes from another device arrive live. Signing out keeps the progress that is already on the device. The Firebase code is downloaded only on a device that has signed in before, or when you open the account dialog, thus a device that never signs in does not fetch it. The site must be opened over `https://` (or `localhost`) for the sign-in popup to work. If the popup is blocked, the site falls back to a redirect sign-in.
