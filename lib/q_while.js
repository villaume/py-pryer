const Q = require('q')

/**
* helper
* use this if you want to a while loop with promises
* @param {function} condition a synchronous function that should return false when it's time to get out of the loop
* @param {function} task the promise returning function to execute while condition is true
* @return {promise} 
**/
module.exports = function (condition, task) {
  const deferred = Q.defer()
  function loop () {
    if (!condition()) {
      return deferred.resolve()
    } else {
      Q.when(task(), loop, deferred.reject)
    }
  }

  Q.nextTick(loop)
  return deferred.promise
}
