// In-memory only. Nothing is written to storage, cookies or the URL.
// (The only cookie is the HttpOnly session cookie set by the server at sign-in.)
export const state = {
  screen: 'intro',
  // Set at start-up from /api/client: this client's bank, with any override merged.
  bank: null,
  clientId: '',
  // True in an AdvisorDefense admin preview. Nothing is saved or sent.
  preview: false,
  questionIndex: 0,
  details: { firmName: '', name: '', email: '', role: '' },
  // Question id -> option index in the bank. Never the shuffled display position.
  answers: {},
  // Question id -> display order of option indexes. Set once per visit.
  optionOrder: {},
  completedAt: null,
  reportDownloaded: false,
  // Set when the completion notification has been attempted, so "Download again" does not resend it.
  notified: false,
};
