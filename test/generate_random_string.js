const chai = require('chai')
const expect = chai.expect
const generate_random_string = require('../lib/generate_random_string')

describe('lib / generate_random_string', function () {
  it('should generate a random string', function () {
    const gen_string = generate_random_string(16)
    expect(gen_string).to.be.a('string')
    expect(gen_string.length).to.equal(16)
  })
})
