const chai = require('chai')
const expect = chai.expect
const q_while = require('../lib/q_while')
const Q = require('q')

describe('lib / q_while', function () {
  it('iterate until true', function () {
    var keep_going = true
    var counter = 0
    return q_while(() => {
      return keep_going === true
    }, () => {
      counter++
      if ( counter > 3 ) {
        keep_going = false
      }
      return Q()
    })
    .then(() => {
      return Q(counter)
    })
    .then(outcome => {
      expect(outcome).to.equal(4)
    })
  })
})
