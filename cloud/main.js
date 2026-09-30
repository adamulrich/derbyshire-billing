/*
 * Derbyshire Water District user administration.
 *
 * Deploy this file as Back4App Cloud Code. The Master Key is used only on the
 * server so user ACLs never need to be exposed to the browser.
 */

function administrator(request) {
  if (!request.user) {
    throw new Parse.Error(Parse.Error.SESSION_MISSING, 'You must be signed in.')
  }
  if (request.user.get('role') !== 'administrator') {
    throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'Administrator access is required.')
  }
  return request.user
}

function userPayload(user) {
  const username = user.get('username') || ''
  const createdAt = user.createdAt ? user.createdAt.toISOString().slice(0, 10) : ''
  return {
    id: user.id,
    name: user.get('name') || username,
    email: user.get('email') || username,
    role: user.get('role') === 'meter-reader' ? 'meter-reader' : 'administrator',
    active: user.get('active') !== false,
    passwordSetAt: user.get('passwordSetAt') || createdAt,
  }
}

Parse.Cloud.define('adminListUsers', async request => {
  administrator(request)
  try {
    const query = new Parse.Query('_User')
    query.ascending('username')
    query.limit(1000)
    const users = await query.find({ useMasterKey: true })
    return users.map(userPayload)
  } catch (error) {
    request.log.error(`adminListUsers failed: ${error instanceof Error ? error.message : String(error)}`)
    throw new Parse.Error(Parse.Error.SCRIPT_FAILED, 'Could not load users from the server.')
  }
})

Parse.Cloud.define('adminCreateUser', async request => {
  administrator(request)
  const name = String(request.params.name || '').trim()
  const email = String(request.params.email || '').trim().toLowerCase()
  const password = String(request.params.password || '')
  const role = request.params.role === 'administrator' ? 'administrator' : 'meter-reader'

  if (!name || !email || password.length < 8) {
    throw new Parse.Error(Parse.Error.INVALID_QUERY, 'Name, email, and an 8-character password are required.')
  }

  const user = new Parse.User()
  user.set('username', email)
  user.set('email', email)
  user.set('password', password)
  user.set('name', name)
  user.set('role', role)
  user.set('active', true)
  user.set('passwordSetAt', new Date().toISOString().slice(0, 10))
  await user.signUp(null, { useMasterKey: true })
  return userPayload(user)
})

Parse.Cloud.define('adminSetUserActive', async request => {
  const admin = administrator(request)
  const userId = String(request.params.userId || '')
  if (!userId) throw new Parse.Error(Parse.Error.INVALID_QUERY, 'A user id is required.')
  if (userId === admin.id) throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'You cannot disable your own account.')

  const user = await new Parse.Query('_User').get(userId, { useMasterKey: true })
  user.set('active', request.params.active !== false)
  await user.save(null, { useMasterKey: true })
  return userPayload(user)
})
