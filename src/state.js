// In-memory only. Nothing is written to storage, cookies or the URL.
export const state = {
  screen: 'landing',
  questionIndex: 0,
  details: { firmName: '', name: '', aum: '', examined: '' },
  answers: {},
  lead: { name: '', email: '', role: '' },
  // Set after the PDF downloads. Unlocks the finding details on the results screen.
  reportDownloaded: false,
  // Set when the lead notification has been attempted, so "Download again" does not send it twice.
  leadNotified: false,
};
