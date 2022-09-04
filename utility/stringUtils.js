// utility functions
function getTwoDigitValue(value) {
  return value < 10 ? "0" + value : "" + value;
}

function capitaliseFirstLetter(lowerCaseString) {
  if (typeof lowerCaseString == undefined) return;
  let firstLetter = lowerCaseString[0] || lowerCaseString.charAt(0);
  return firstLetter
    ? firstLetter.toUpperCase() + lowerCaseString.slice(1)
    : "";
}

module.exports = {
  getTwoDigitValue,
  capitaliseFirstLetter,
};
