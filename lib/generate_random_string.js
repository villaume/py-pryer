'use strict'

/**
* helper
* generate a random alphanumeric string (for tokens)
* @param {int} length how long a random a string you want
* @return {string} The generated string
**/
module.exports = function (length) {
  let text=''
  const alphaNums = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

  for (var i = 0; i < length; i++) {
    text += alphaNums.charAt(Math.floor(Math.random() * alphaNums.length))
  }
  return text
}
