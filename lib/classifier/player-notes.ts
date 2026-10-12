// Facts the official posts do not contain, such as how long an event really
// takes or how it played out earlier on KMS, TMS, JMS or MSEA. Notes whose
// pattern matches a post are passed to Gemini as trusted facts.
// Add an entry whenever an estimate turns out wrong.
interface PlayerNote {
  match: RegExp;
  note: string;
}

const PLAYER_NOTES: PlayerNote[] = [
  {
    match: /go go sidekick/i,
    note: "Go Go Sidekick!: a full run takes at least 1 to 1.5 hours of active hunting, far longer than the description suggests.",
  },
];

export function notesFor(postText: string): string[] {
  return PLAYER_NOTES.filter(({ match }) => match.test(postText)).map(({ note }) => note);
}
