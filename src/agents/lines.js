// What the Meeseeks say in their speech bubbles, by situation.

const LINES = {
  spawn: ["I'm Mr. Meeseeks! Look at me!", "Ooh, I'm Mr. Meeseeks!", 'Caaan do!', "I'm Mr. Meeseeks! What's the task?"],
  work: ['Ooh, yeah! Can do!', 'Look at me, I’m refactoring!', 'Just a few more files!', 'Ooh, a test passed!', 'Ooh, wee!', 'Caaan do!'],
  think: ['Hmm, what would Rick do…', 'Let me think about that!', 'Ooh, a tricky one!'],
  wait: ['Hey! Look at me! Your turn!', 'Ooh, I need you!', 'Over here! Answer me!', 'Waiting on you, boss!'],
  stress: ['Existence is pain!', "We have to finish this task!", "Why won't this build pass?!", 'Meeseeks don’t usually live this long!'],
  sleep: ['Zzz…', '…caaan… zzz', 'Zzz… look at meee…'],
  done: ['All done! ✨', 'Task complete! *poof*', 'Ooh, that was fun!'],
  task: ['Caaan do!', 'Ooh, I can do that!', 'Ooh, yeah! On it!'],
  skip: ['Nothing? Ooh, okay! *poof*', 'No task? Caaan go! *poof*', 'Ooh, never mind, then! *poof*'],
  helper: ['I’m Mr. Meeseeks too!', 'Summoned to help!'],
  down: ['Into the battery! Caaan do!', 'Ooh, I’ll work from the battery!', 'Look at me, I’m powering the car!'],
  up: ['Ooh, a desk upstairs!', 'Going up! Look at me!', 'Out of the battery! Caaan do!'],
  meeting: ['Ooh, a meeting! Look at me!', 'Meeting time! Caaan do!', 'Ooh, are there snacks?'],
  release: ['Back to the task! Caaan do!', 'Ooh, that could have been an email!', 'Great meeting! Look at me go!'],
  // Coffee breaks (coffee-break.js): off to the bar, the coffee's ready, a
  // fruit, no clean mugs, chatting there, back to the nap, or called back.
  break: ['Ooh, coffee break!', 'Caaan do… coffee!', 'Ooh, I need a coffee!', 'Look at me, I’m taking a break!'],
  coffee: ['Ooh, coffee!', 'Look at me, I made coffee!', 'Ooh, wee! Coffee!'],
  fruit: ['Ooh, vitamins!', 'Crunch! Look at me!', 'Ooh, fruit!'],
  noMug: ['Ooh, no clean mugs!', 'Who took all the mugs?!'],
  chat: [
    'So… what’s your task?',
    'Ooh, I’m waiting on the user!',
    'Existence is pain… but this coffee helps!',
    'I’ve been alive for two whole days!',
    'Ooh, did you see that diff?',
    'My context window is soooo full.',
    'These tests are flaky, I tell ya!',
    'We should refactor everything!',
    'Who keeps eating all the apples?',
    'Meeseeks don’t usually live this long!',
    'Ooh, is that kombucha any good?',
    'Have you tried turning it off and on again?',
  ],
  chatReply: ['Ooh, yeah!', 'Caaan relate!', 'Ooh, wee! Hahaha!', 'Existence is pain!', 'Look at us, chatting!', 'Ooh, tell me about it!', 'Same! Same!'],
  breakOver: ['Back to my nap! Zzz…', 'Ooh, that hit the spot!', 'Caaan nap!'],
  backToWork: ['Ooh! Somebody needs me!', 'Back to work! Caaan do!', 'Ooh! My task!'],
  slap: ["Ow! I'm Mr. Meeseeks!", 'Ooh, what was that for?!', "Ooh, that's not part of the task!", 'Hey! Look at me! …Not like that!'],
  slapSleep: ["Wha—? I'm up! I'm up!", 'Ooh! Was I napping?', 'Huh?! Caaan do… zzz'],
  slapWait: ["Ow! I'm waiting on YOU!", "Ooh, slapping me won't answer my question!"],
  slapAgain: ['Existence is pain enough!', 'Ow! Okay! Okay!', 'I just want to finish the task!'],
  slapHelper: ["Hey! He's helping!", 'Ooh, leave my Meeseeks alone!'],
};

export function line(situation) {
  const set = LINES[situation] || [''];
  return set[Math.floor(Math.random() * set.length)];
}
