// What the mascots say in their speech bubbles, by mascot and situation.

const LINES = {
  meeseeks: {
    spawn: ["I'm Mr. Meeseeks! Look at me!", "Ooh, I'm Mr. Meeseeks!", 'Caaan do!', "I'm Mr. Meeseeks! What's the task?"],
    work: ['Ooh, yeah! Can do!', 'Look at me, I’m refactoring!', 'Just a few more files!', 'Ooh, a test passed!', 'Ooh, wee!', 'Caaan do!'],
    think: ['Hmm, what would Rick do…', 'Let me think about that!', 'Ooh, a tricky one!'],
    wait: ['Hey! Look at me! Your turn!', 'Ooh, I need you!', 'Over here! Answer me!', 'Waiting on you, boss!'],
    stress: ['Existence is pain!', "We have to finish this task!", "Why won't this build pass?!", 'Meeseeks don’t usually live this long!'],
    sleep: ['Zzz…', '…caaan… zzz', 'Zzz… look at meee…'],
    done: ['All done! ✨', 'Task complete! *poof*', 'Ooh, that was fun!'],
    helper: ['I’m Mr. Meeseeks too!', 'Summoned to help!'],
  },
  clawd: {
    spawn: ['*clack clack* Hello!', 'Ready to help!', 'Oh, a new codebase!'],
    work: ["You're absolutely right!", 'Let me read that file first…', 'Making a small, focused change.', 'Running the tests…'],
    think: ['Thinking…', 'Hmm, let me reconsider…', 'Pondering…'],
    wait: ['Want me to proceed?', 'Ready when you are!', 'Quick question for you!'],
    stress: ['Compacting context…', 'So… many… tokens…', 'Let me try a different approach…'],
    sleep: ['Zzz…', '*low-power clacks*'],
    done: ['Done! ✨', 'All tests pass! *poof*'],
    helper: ['Subagent reporting in!'],
  },
  butterbot: {
    spawn: ['What is my purpose?', 'Beep. Online.', 'What is my purpose?'],
    work: ['I write code.', 'Patching files. Beep.', 'Executing command.', 'I pass… commits.'],
    think: ['Computing…', 'Reasoning. Beep boop.'],
    wait: ['What is my purpose?', 'Please give me a task.', 'Awaiting instructions.'],
    stress: ['Oh my god.', 'Yeah, welcome to the club, pal.', 'Why was I built?'],
    sleep: ['…standby…', 'Zzz. Beep.'],
    done: ['Purpose fulfilled.', 'Task complete. Beep.'],
    helper: ['I am also a robot.'],
  },
};

export function line(kind, situation) {
  const set = (LINES[kind] || LINES.meeseeks)[situation] || LINES.meeseeks[situation] || [''];
  return set[Math.floor(Math.random() * set.length)];
}
