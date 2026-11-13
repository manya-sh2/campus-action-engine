// Aliases only normalize explicitly stated requirements; they never infer a branch.
const aliases = {
  cse: 'CSE', cs: 'CSE', 'computer science': 'CSE', 'computer science and engineering': 'CSE',
  it: 'IT', 'information technology': 'IT',
  mnc: 'MNC', 'mathematics and computing': 'MNC',
  ece: 'ECE', 'electronics and communication': 'ECE', 'electronics and communication engineering': 'ECE',
  eee: 'EEE', ee: 'EEE', electrical: 'EEE', 'electrical engineering': 'EEE',
  mining: 'Mining', 'mining engineering': 'Mining',
  mechanical: 'Mechanical', 'mechanical engineering': 'Mechanical', me: 'Mechanical',
  civil: 'Civil', 'civil engineering': 'Civil',
  chemical: 'Chemical', 'chemical engineering': 'Chemical',
  metallurgy: 'Metallurgy', metallurgical: 'Metallurgy', 'metallurgical engineering': 'Metallurgy',
  ceramic: 'Ceramic', 'ceramic engineering': 'Ceramic',
};
function canonicalBranch(value) {
  const text = String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
  return aliases[text] || text;
}
module.exports = { aliases, canonicalBranch };
