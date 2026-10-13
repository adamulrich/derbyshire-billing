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

function financialStaff(request) {
  if (!request.user) {
    throw new Parse.Error(Parse.Error.SESSION_MISSING, 'You must be signed in.')
  }
  const role = request.user.get('role')
  if (role !== 'administrator' && role !== 'bookkeeper') {
    throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'Bookkeeper or administrator access is required.')
  }
  return request.user
}

function signedIn(request) {
  if (!request.user) throw new Parse.Error(Parse.Error.SESSION_MISSING, 'You must be signed in.')
  return request.user
}

function userPayload(user) {
  const username = user.get('username') || ''
  const createdAt = user.createdAt ? user.createdAt.toISOString().slice(0, 10) : ''
  return {
    id: user.id,
    name: user.get('name') || username,
    email: user.get('email') || username,
    role: user.get('role') === 'meter-reader' ? 'meter-reader' : user.get('role') === 'bookkeeper' ? 'bookkeeper' : 'administrator',
    active: user.get('active') !== false,
    passwordSetAt: user.get('passwordSetAt') || createdAt,
  }
}

function paymentPayload(payment) {
  const customer = payment.get('customer')
  return {
    id: payment.id,
    customerId: customer && customer.id ? customer.id : payment.get('customerId') || '',
    amount: Number(payment.get('amount') || 0),
    paymentDate: payment.get('paymentDate') || '',
    method: payment.get('method') || 'Other',
    reference: payment.get('reference') || '',
    notes: payment.get('notes') || '',
  }
}

function billingOverridePayload(override) {
  const customer = override.get('customer')
  const cycle = override.get('cycle')
  return {
    id: override.id,
    customerId: customer && customer.id ? customer.id : override.get('customerId') || '',
    cycleId: cycle && cycle.id ? cycle.id : override.get('cycleId') || '',
    amount: Number(override.get('amount') || 0),
    reason: override.get('reason') || '',
    updatedAt: override.updatedAt ? override.updatedAt.toISOString() : '',
  }
}

function readingPayload(reading) {
  const cycle = reading.get('cycle')
  const reader = reading.get('reader')
  return {
    id: reading.id,
    reading: Number(reading.get('reading') || 0),
    previousReading: Number(reading.get('previousReading') || 0),
    readAt: reading.get('readAt') || '',
    cycleName: cycle && cycle.get ? cycle.get('name') || '' : '',
    readerName: reader && reader.get ? reader.get('name') || reader.get('username') || '' : '',
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
  const role = request.params.role === 'administrator' ? 'administrator' : request.params.role === 'bookkeeper' ? 'bookkeeper' : 'meter-reader'

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

Parse.Cloud.define('adminUpdateUser', async request => {
  const admin = administrator(request)
  const userId = String(request.params.userId || '')
  const name = String(request.params.name || '').trim()
  const email = String(request.params.email || '').trim().toLowerCase()
  const password = String(request.params.password || '')
  const role = request.params.role === 'administrator' ? 'administrator' : request.params.role === 'bookkeeper' ? 'bookkeeper' : 'meter-reader'
  if (!userId || !name || !email || (password && password.length < 8)) {
    throw new Parse.Error(Parse.Error.INVALID_QUERY, 'User id, name, and email are required. A new password must be at least 8 characters.')
  }
  if (userId === admin.id && role !== 'administrator') {
    throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'You cannot remove administrator access from your own account.')
  }
  const user = await new Parse.Query('_User').get(userId, { useMasterKey: true })
  const duplicate = await new Parse.Query('_User').equalTo('username', email).first({ useMasterKey: true })
  if (duplicate && duplicate.id !== user.id) throw new Parse.Error(Parse.Error.DUPLICATE_VALUE, 'That email address is already assigned to another user.')
  user.set('username', email)
  user.set('email', email)
  user.set('name', name)
  user.set('role', role)
  if (password) {
    user.set('password', password)
    user.set('passwordSetAt', new Date().toISOString().slice(0, 10))
  }
  await user.save(null, { useMasterKey: true })
  return userPayload(user)
})

Parse.Cloud.define('adminDeleteUser', async request => {
  const admin = administrator(request)
  const userId = String(request.params.userId || '')
  if (!userId) throw new Parse.Error(Parse.Error.INVALID_QUERY, 'A user id is required.')
  if (userId === admin.id) throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'You cannot delete your own account.')
  const user = await new Parse.Query('_User').get(userId, { useMasterKey: true })
  await user.destroy({ useMasterKey: true })
  return { id: userId }
})

Parse.Cloud.define('adminListPayments', async request => {
  financialStaff(request)
  const query = new Parse.Query('Payment')
  query.include('customer')
  query.descending('paymentDate')
  query.limit(1000)
  const payments = await query.find({ useMasterKey: true })
  return payments.map(paymentPayload)
})

Parse.Cloud.define('adminRecordPayment', async request => {
  const staff = financialStaff(request)
  const customerId = String(request.params.customerId || '')
  const amount = Number(request.params.amount)
  if (!customerId || !Number.isFinite(amount) || amount <= 0) {
    throw new Parse.Error(Parse.Error.INVALID_QUERY, 'A customer and a positive payment amount are required.')
  }
  const customer = await new Parse.Query('Customer').get(customerId, { useMasterKey: true })
  const payment = new Parse.Object('Payment')
  payment.set('customer', customer)
  payment.set('amount', Math.round(amount * 100) / 100)
  payment.set('paymentDate', String(request.params.paymentDate || new Date().toISOString().slice(0, 10)))
  payment.set('method', String(request.params.method || 'Other'))
  payment.set('reference', String(request.params.reference || ''))
  payment.set('notes', String(request.params.notes || ''))
  payment.set('enteredBy', staff)
  await payment.save(null, { useMasterKey: true })
  return paymentPayload(payment)
})

Parse.Cloud.define('adminUpdatePayment', async request => {
  const staff = financialStaff(request)
  const paymentId = String(request.params.paymentId || '')
  const amount = Number(request.params.amount)
  if (!paymentId || !Number.isFinite(amount) || amount <= 0) {
    throw new Parse.Error(Parse.Error.INVALID_QUERY, 'A payment and a positive payment amount are required.')
  }
  const payment = await new Parse.Query('Payment').get(paymentId, { useMasterKey: true })
  payment.set('amount', Math.round(amount * 100) / 100)
  payment.set('paymentDate', String(request.params.paymentDate || new Date().toISOString().slice(0, 10)))
  payment.set('method', String(request.params.method || 'Other'))
  payment.set('reference', String(request.params.reference || ''))
  payment.set('notes', String(request.params.notes || ''))
  payment.set('updatedBy', staff)
  await payment.save(null, { useMasterKey: true })
  return paymentPayload(payment)
})

Parse.Cloud.define('adminListBillingOverrides', async request => {
  financialStaff(request)
  const cycleId = String(request.params.cycleId || '')
  if (!cycleId) throw new Parse.Error(Parse.Error.INVALID_QUERY, 'A billing cycle is required.')
  const cycle = new Parse.Object('ReadingCycle')
  cycle.id = cycleId
  const query = new Parse.Query('BillingOverride')
  query.equalTo('cycle', cycle)
  query.include('customer')
  query.descending('updatedAt')
  query.limit(1000)
  const overrides = await query.find({ useMasterKey: true })
  return overrides.map(billingOverridePayload)
})

Parse.Cloud.define('adminGetCustomerDetails', async request => {
  const user = signedIn(request)
  const customerId = String(request.params.customerId || '')
  if (!customerId) throw new Parse.Error(Parse.Error.INVALID_QUERY, 'A customer id is required.')
  const customer = await new Parse.Query('Customer').get(customerId, { useMasterKey: true })
  const readingsQuery = new Parse.Query('MeterReading')
  readingsQuery.equalTo('customer', customer)
  readingsQuery.include('cycle')
  readingsQuery.include('reader')
  readingsQuery.descending('readAt')
  readingsQuery.limit(1000)
  const readingsPromise = readingsQuery.find({ useMasterKey: true })
  const isFinancialStaff = user.get('role') === 'administrator' || user.get('role') === 'bookkeeper'
  if (!isFinancialStaff) return { readings: (await readingsPromise).map(readingPayload), payments: [], adjustments: [] }
  const paymentsQuery = new Parse.Query('Payment')
  paymentsQuery.equalTo('customer', customer)
  paymentsQuery.descending('paymentDate')
  paymentsQuery.limit(1000)
  const adjustmentsQuery = new Parse.Query('BillingOverride')
  adjustmentsQuery.equalTo('customer', customer)
  adjustmentsQuery.include('cycle')
  adjustmentsQuery.descending('updatedAt')
  adjustmentsQuery.limit(1000)
  const [readings, payments, adjustments] = await Promise.all([readingsPromise, paymentsQuery.find({ useMasterKey: true }), adjustmentsQuery.find({ useMasterKey: true })])
  return { readings: readings.map(readingPayload), payments: payments.map(paymentPayload), adjustments: adjustments.map(billingOverridePayload) }
})

Parse.Cloud.define('adminSetBillingOverride', async request => {
  const staff = financialStaff(request)
  const customerId = String(request.params.customerId || '')
  const cycleId = String(request.params.cycleId || '')
  const amount = Number(request.params.amount)
  const reason = String(request.params.reason || '').trim()
  if (!customerId || !cycleId || !Number.isFinite(amount) || !reason) {
    throw new Parse.Error(Parse.Error.INVALID_QUERY, 'A customer, billing cycle, amount, and reason are required.')
  }
  const customer = await new Parse.Query('Customer').get(customerId, { useMasterKey: true })
  const cycle = await new Parse.Query('ReadingCycle').get(cycleId, { useMasterKey: true })
  const query = new Parse.Query('BillingOverride')
  query.equalTo('customer', customer)
  query.equalTo('cycle', cycle)
  let override = await query.first({ useMasterKey: true })
  if (!override) override = new Parse.Object('BillingOverride')
  override.set('customer', customer)
  override.set('cycle', cycle)
  override.set('amount', Math.round(amount * 100) / 100)
  override.set('reason', reason)
  override.set('updatedBy', staff)
  await override.save(null, { useMasterKey: true })
  return billingOverridePayload(override)
})

Parse.Cloud.define('adminClearBillingOverride', async request => {
  financialStaff(request)
  const overrideId = String(request.params.overrideId || '')
  if (!overrideId) throw new Parse.Error(Parse.Error.INVALID_QUERY, 'An override id is required.')
  const override = await new Parse.Query('BillingOverride').get(overrideId, { useMasterKey: true })
  await override.destroy({ useMasterKey: true })
  return { id: overrideId }
})

Parse.Cloud.define('adminExportBackup', async request => {
  administrator(request)
  const load = async (className, configure) => {
    const query = new Parse.Query(className)
    if (configure) configure(query)
    query.limit(10000)
    const objects = await query.find({ useMasterKey: true })
    return objects.map(object => object.toJSON())
  }
  const [customers, cycles, readings, rates, payments, billingOverrides] = await Promise.all([
    load('Customer', query => query.ascending('route')),
    load('ReadingCycle', query => query.descending('startDate')),
    load('MeterReading', query => query.include('customer').include('cycle').include('reader').descending('readAt')),
    load('RateSchedule', query => query.descending('effectiveDate')),
    load('Payment', query => query.include('customer').include('enteredBy').descending('paymentDate')),
    load('BillingOverride', query => query.include('customer').include('cycle').include('updatedBy').descending('updatedAt')),
  ])
  return {
    exportedAt: new Date().toISOString(),
    collections: { Customer: customers, ReadingCycle: cycles, MeterReading: readings, RateSchedule: rates, Payment: payments, BillingOverride: billingOverrides },
  }
})
