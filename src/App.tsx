import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import Parse from './lib/parse'

type View = 'dashboard' | 'readings' | 'route' | 'customers' | 'billing' | 'users'
type Role = 'meter-reader' | 'administrator'
type Customer = {
  id: string | number; name: string; address: string; serviceAddress1?: string; serviceAddress2?: string; serviceCity?: string; serviceState?: string; serviceZip?: string; billingSameAsService?: boolean; billingAddress1?: string; billingAddress2?: string; billingCity?: string; billingState?: string; billingZip?: string; phone: string; email: string
  previous: number; current: number | null; lastRead: string | null; route: number; lat: number; lng: number; accountNumber?: string; partTimeFullTime?: string; meterInstalled?: string; residents?: string; ownerTenant?: string; notes?: string; business?: string; parcelId?: string; connectionStatus?: string; phone2?: string; email2?: string; paperlessBilling?: string; geocodeSource?: string; geocodeDisplayName?: string; geocodedAt?: string; boardMember?: boolean
}
type UserAccount = { id: string | number; name: string; email: string; role: Role; active: boolean; passwordSetAt: string }
type ReadingCycle = { id: string | number; name: string; startDate: string; dueDate: string; months: number; status: 'open' | 'closed' }
type RateSchedule = { id: string | number; base: number; maintenanceMonthly: number; included: number; tierOneEnd: number; tierOne: number; tierTwo: number; boardMemberDiscount: number; effectiveDate: string }

const RATE: RateSchedule = { id: 'default-rate', base: 265.23, maintenanceMonthly: 40, included: 4000, tierOneEnd: 8000, tierOne: 3.50, tierTwo: 3.93, boardMemberDiscount: 170, effectiveDate: '2026-09-01' }
const initialCustomers: Customer[] = [
  { id: 1, name: 'The Hargroves', address: '12 Derbyshire Lane', phone: '(530) 555-0142', email: 'hargrove@example.com', previous: 18420, current: 21240, lastRead: '2026-09-25', route: 1, lat: 39.25, lng: -121.02 },
  { id: 2, name: 'M. Alvarez', address: '18 Derbyshire Lane', phone: '(530) 555-0186', email: 'malvarez@example.com', previous: 9100, current: 10750, lastRead: '2026-09-25', route: 2, lat: 39.251, lng: -121.018 },
  { id: 3, name: 'Cedar Ridge HOA', address: '24 Derbyshire Lane', phone: '(530) 555-0109', email: 'cedar@example.com', previous: 46300, current: null, lastRead: null, route: 3, lat: 39.252, lng: -121.016 },
  { id: 4, name: 'The Parkers', address: '31 Derbyshire Lane', phone: '(530) 555-0172', email: 'parker@example.com', previous: 12780, current: 15110, lastRead: '2026-09-26', route: 4, lat: 39.253, lng: -121.014 },
  { id: 5, name: 'Juniper Farm', address: '44 Derbyshire Lane', phone: '(530) 555-0133', email: 'juniper@example.com', previous: 7250, current: null, lastRead: null, route: 5, lat: 39.254, lng: -121.012 },
  { id: 6, name: 'E. Washington', address: '52 Derbyshire Lane', phone: '(530) 555-0160', email: 'ewashington@example.com', previous: 29800, current: 32640, lastRead: '2026-09-26', route: 6, lat: 39.255, lng: -121.01 },
  { id: 7, name: 'The Lindens', address: '67 Derbyshire Lane', phone: '(530) 555-0118', email: 'lindens@example.com', previous: 15200, current: null, lastRead: null, route: 7, lat: 39.256, lng: -121.008 },
  { id: 8, name: 'North Fork School', address: '75 Derbyshire Lane', phone: '(530) 555-0191', email: 'school@example.com', previous: 60600, current: 69990, lastRead: '2026-09-27', route: 8, lat: 39.257, lng: -121.006 },
]
const initialUsers: UserAccount[] = [
  { id: 1, name: 'Jamie Doe', email: 'jamie@derbyshirewater.org', role: 'administrator', active: true, passwordSetAt: '2026-08-14' },
  { id: 2, name: 'Morgan Lee', email: 'morgan@derbyshirewater.org', role: 'meter-reader', active: true, passwordSetAt: '2026-08-22' },
]
const initialCycles: ReadingCycle[] = [{ id: 'demo-cycle', name: 'September 2026', startDate: '2026-09-01', dueDate: '2026-10-01', months: 4, status: 'open' }]

function addressParts(customer: Customer, billing = false) { const prefix = billing && !customer.billingSameAsService ? 'billing' : 'service'; const fallback = customer.address || ''; return { line1: customer[`${prefix}Address1` as keyof Customer] as string || fallback, line2: customer[`${prefix}Address2` as keyof Customer] as string || '', city: customer[`${prefix}City` as keyof Customer] as string || '', state: customer[`${prefix}State` as keyof Customer] as string || '', zip: customer[`${prefix}Zip` as keyof Customer] as string || '' } }
function formattedAddress(customer: Customer, billing = false) { const parts = addressParts(customer, billing); return [parts.line1, parts.line2, [parts.city, parts.state, parts.zip].filter(Boolean).join(', ')].filter(Boolean).join(', ') }
function lastNameForSort(name: string) { const parts = name.replace(/[()]/g, '').trim().split(/\s+/).filter(part => part && part !== '&' && part.toLowerCase() !== 'and'); return (parts[parts.length - 1] || name).replace(/[^a-z0-9]/gi, '').toLocaleLowerCase() }
function greeting(name: string) { const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: '2-digit', hourCycle: 'h23' }).format(new Date())); return `${hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'}, ${name}` }

function customerFromParse(object: Parse.Object): Customer {
  const legacyAddress = object.get('address') || ''
  const billingSameAsService = object.get('billingSameAsService') === undefined ? true : Boolean(object.get('billingSameAsService'))
  return {
    id: object.id || '',
    name: object.get('name') || '',
    address: legacyAddress,
    serviceAddress1: object.get('serviceAddress1') || legacyAddress,
    serviceAddress2: object.get('serviceAddress2') || '',
    serviceCity: object.get('serviceCity') || '',
    serviceState: object.get('serviceState') || '',
    serviceZip: object.get('serviceZip') || '',
    billingSameAsService,
    billingAddress1: object.get('billingAddress1') || '',
    billingAddress2: object.get('billingAddress2') || '',
    billingCity: object.get('billingCity') || '',
    billingState: object.get('billingState') || '',
    billingZip: object.get('billingZip') || '',
    phone: object.get('phone') || '',
    email: object.get('email') || '',
    previous: Number(object.get('previous') || 0),
    current: object.get('current') === undefined || object.get('current') === null ? null : Number(object.get('current')),
    lastRead: object.get('lastRead') || null,
    route: Number(object.get('route') || 0),
    lat: Number(object.get('lat') || 39.25),
    lng: Number(object.get('lng') || -121.02),
    accountNumber: object.get('accountNumber') || '',
    partTimeFullTime: object.get('partTimeFullTime') || '',
    meterInstalled: object.get('meterInstalled') || '',
    residents: object.get('residents') || '',
    ownerTenant: object.get('ownerTenant') || '',
    notes: object.get('notes') || '',
    business: object.get('business') || '',
    parcelId: object.get('parcelId') || '',
    connectionStatus: object.get('connectionStatus') || '',
    phone2: object.get('phone2') || '',
    email2: object.get('email2') || '',
    paperlessBilling: object.get('paperlessBilling') || '',
    geocodeSource: object.get('geocodeSource') || '',
    geocodeDisplayName: object.get('geocodeDisplayName') || '',
    geocodedAt: object.get('geocodedAt') || '',
    boardMember: Boolean(object.get('boardMember')),
  }
}

function cycleFromParse(object: Parse.Object): ReadingCycle {
  return { id: object.id || '', name: object.get('name') || 'Reading checkpoint', startDate: object.get('startDate') || today, dueDate: object.get('dueDate') || today, months: Number(object.get('months') || 4), status: object.get('status') === 'closed' ? 'closed' : 'open' }
}

function migrateRate(rate: Partial<RateSchedule> | null | undefined): RateSchedule { const next = { ...RATE, ...(rate || {}) }; return next.included === 40 && next.tierOneEnd === 80 ? { ...next, included: 4000, tierOneEnd: 8000 } : next }
function rateFromParse(object: Parse.Object): RateSchedule {
  return migrateRate({ id: object.id || '', base: Number(object.get('base') ?? RATE.base), maintenanceMonthly: Number(object.get('maintenanceMonthly') ?? RATE.maintenanceMonthly), included: Number(object.get('included') ?? RATE.included), tierOneEnd: Number(object.get('tierOneEnd') ?? RATE.tierOneEnd), tierOne: Number(object.get('tierOne') ?? RATE.tierOne), tierTwo: Number(object.get('tierTwo') ?? RATE.tierTwo), boardMemberDiscount: Number(object.get('boardMemberDiscount') ?? RATE.boardMemberDiscount), effectiveDate: object.get('effectiveDate') || today })
}

async function saveCustomerToParse(customer: Customer): Promise<Customer> {
  let object: Parse.Object
  if (typeof customer.id === 'string' && !customer.id.startsWith('temp-')) {
    object = await new Parse.Query('Customer').get(customer.id)
  } else {
    object = new Parse.Object('Customer')
  }
  object.set('name', customer.name)
  object.set('address', formattedAddress(customer))
  object.set('serviceAddress1', addressParts(customer).line1)
  object.set('serviceAddress2', addressParts(customer).line2)
  object.set('serviceCity', addressParts(customer).city)
  object.set('serviceState', addressParts(customer).state)
  object.set('serviceZip', addressParts(customer).zip)
  object.set('billingSameAsService', customer.billingSameAsService !== false)
  object.set('billingAddress1', addressParts(customer, true).line1)
  object.set('billingAddress2', addressParts(customer, true).line2)
  object.set('billingCity', addressParts(customer, true).city)
  object.set('billingState', addressParts(customer, true).state)
  object.set('billingZip', addressParts(customer, true).zip)
  object.set('phone', customer.phone)
  object.set('email', customer.email)
  object.set('previous', customer.previous)
  object.set('current', customer.current)
  object.set('lastRead', customer.lastRead)
  object.set('route', customer.route)
  object.set('lat', customer.lat)
  object.set('lng', customer.lng)
  object.set('accountNumber', customer.accountNumber || '')
  object.set('partTimeFullTime', customer.partTimeFullTime || '')
  object.set('meterInstalled', customer.meterInstalled || '')
  object.set('residents', customer.residents || '')
  object.set('ownerTenant', customer.ownerTenant || '')
  object.set('notes', customer.notes || '')
  object.set('business', customer.business || '')
  object.set('parcelId', customer.parcelId || '')
  object.set('connectionStatus', customer.connectionStatus || '')
  object.set('phone2', customer.phone2 || '')
  object.set('email2', customer.email2 || '')
  object.set('paperlessBilling', customer.paperlessBilling || '')
  object.set('geocodeSource', customer.geocodeSource || '')
  object.set('geocodeDisplayName', customer.geocodeDisplayName || '')
  object.set('geocodedAt', customer.geocodedAt || '')
  object.set('boardMember', customer.boardMember === true)
  return customerFromParse(await object.save())
}

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
const formatNumber = (n: number) => n.toLocaleString('en-US')
const today = new Date().toISOString().slice(0, 10)

async function exportCustomersXlsx(customers: Customer[]) {
  const XLSX = await import('xlsx-js-style')
  const headers = [
    'Route', 'Account Number', 'Customer Name', 'Service Address 1', 'Service Address 2', 'Service City', 'Service State', 'Service ZIP',
    'Billing Address 1', 'Billing Address 2', 'Billing City', 'Billing State', 'Billing ZIP', 'Phone 1', 'Phone 2', 'Email 1', 'Email 2',
    'Parcel ID', 'Owner/Tenant', 'How Many Residents', 'Part/Full Time', 'Meter Installed', 'Connection Status', 'Notes', 'Business',
    'Paperless Billing', 'Previous Meter Reading (CF)', 'Current Meter Reading (CF)', 'Last Read', 'Latitude', 'Longitude', 'Geocoding Source', 'Geocoded Display Name', 'Geocoded Date', 'Board Member',
  ]
  const rows = [...customers].sort((a, b) => a.route - b.route).map(customer => {
    const service = addressParts(customer)
    const billing = addressParts(customer, true)
    return [
      customer.route, customer.accountNumber || '', customer.name, service.line1, service.line2, service.city, service.state, service.zip,
      billing.line1, billing.line2, billing.city, billing.state, billing.zip, customer.phone || '', customer.phone2 || '', customer.email || '', customer.email2 || '',
      customer.parcelId || '', customer.ownerTenant || '', customer.residents || '', customer.partTimeFullTime || '', customer.meterInstalled || '', customer.connectionStatus || '', customer.notes || '', customer.business || '',
      customer.paperlessBilling || '', customer.previous, customer.current === null ? '' : customer.current, customer.lastRead || '', customer.lat || '', customer.lng || '', customer.geocodeSource || '', customer.geocodeDisplayName || '', customer.geocodedAt || '', customer.boardMember ? 'Yes' : 'No',
    ]
  })
  const title = 'Derbyshire Water District Customer Export'
  const subtitle = `Exported ${today} from ${rows.length} customer records. Service and billing addresses, meter readings, contact information, and geocoding details are included.`
  const worksheet = XLSX.utils.aoa_to_sheet([[title], [subtitle], [], headers, ...rows])
  const lastColumn = headers.length - 1
  const lastColumnLetter = XLSX.utils.encode_col(lastColumn)
  const lastRow = rows.length + 4
  worksheet['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: lastColumn } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: lastColumn } },
  ]
  worksheet['!autofilter'] = { ref: `A4:${lastColumnLetter}${lastRow}` }
  worksheet['!cols'] = [9, 14, 24, 24, 16, 14, 11, 11, 24, 16, 14, 11, 11, 17, 17, 29, 29, 15, 14, 14, 14, 14, 18, 30, 18, 28, 16, 16, 14, 14, 14, 28, 52, 18, 13].map(wch => ({ wch }))
  worksheet['!rows'] = [{ hpt: 28 }, { hpt: 30 }, {}, { hpt: 42 }]
  const border = { style: 'thin', color: { rgb: 'B7D6D4' } }
  const headerStyle = { font: { name: 'Arial', sz: 10, bold: true, color: { rgb: 'FFFFFF' } }, fill: { patternType: 'solid', fgColor: { rgb: '2C7A7B' } }, alignment: { vertical: 'center', wrap_text: true }, border: { top: border, bottom: border, left: border, right: border } }
  const titleStyle = { font: { name: 'Arial', sz: 16, bold: true, color: { rgb: 'FFFFFF' } }, fill: { patternType: 'solid', fgColor: { rgb: '123B4A' } }, alignment: { vertical: 'center' } }
  const subtitleStyle = { font: { name: 'Arial', sz: 10, italic: true, color: { rgb: '315A64' } }, fill: { patternType: 'solid', fgColor: { rgb: 'E8F2F1' } }, alignment: { vertical: 'center' } }
  worksheet.A1.s = titleStyle
  worksheet.A2.s = subtitleStyle
  headers.forEach((_, column) => {
    const cell = worksheet[XLSX.utils.encode_cell({ r: 3, c: column })]
    if (cell) cell.s = headerStyle
  })
  for (let row = 0; row < rows.length; row += 1) {
    if (row % 2 !== 0) {
      for (let column = 0; column <= lastColumn; column += 1) {
        const cell = worksheet[XLSX.utils.encode_cell({ r: row + 4, c: column })]
        if (cell) cell.s = { fill: { patternType: 'solid', fgColor: { rgb: 'EFF8F7' } } }
      }
    }
  }
  const textColumns = [1, 7, 12, 17]
  textColumns.forEach(column => { for (let row = 4; row <= lastRow; row += 1) { const cell = worksheet[XLSX.utils.encode_cell({ r: row, c: column })]; if (cell) cell.t = 's' } })
  ;[26, 27].forEach(column => { for (let row = 4; row <= lastRow; row += 1) { const cell = worksheet[XLSX.utils.encode_cell({ r: row, c: column })]; if (cell) cell.z = '#,##0' } })
  ;[29, 30].forEach(column => { for (let row = 4; row <= lastRow; row += 1) { const cell = worksheet[XLSX.utils.encode_cell({ r: row, c: column })]; if (cell) cell.z = '0.0000000' } })
  const workbook = XLSX.utils.book_new()
  workbook.Props = { Title: title, Subject: 'Derbyshire Water District customer data', Author: 'Derbyshire Water District' }
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Customer Export')
  XLSX.writeFile(workbook, `derbyshire-water-customer-export-${today}.xlsx`)
}

function Icon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
    gauge: 'M4 18a8 8 0 1 1 16 0M12 10v6m0 0 4-3', map: 'M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3V6zm6-3v15m6-12v15',
    users: 'M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1m6-9a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm7-4a3 3 0 0 1 0 6m2 7v-1a4 4 0 0 0-3-3',
    receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2V3zm3 5h6m-6 4h6m-6 4h3', plus: 'M12 5v14m-7-7h14', download: 'M12 3v12m0 0 4-4m-4 4-4-4M5 21h14',
    search: 'm20 20-4.3-4.3M10.8 17a6.2 6.2 0 1 1 0-12.4 6.2 6.2 0 0 1 0 12.4z', check: 'm5 12 4 4L19 6', alert: 'M12 3 2 21h20L12 3zm0 6v4m0 4h.01', chevron: 'm9 18 6-6-6-6', edit: 'M4 20h4L19 9l-4-4L4 16v4zm9-13 4 4', trash: 'M4 7h16m-10 4v6m4-6v6m-8-10 1 13h10l1-13M9 7V4h6v3', sort: 'M8 6h12M4 6h.01M4 12h.01M8 12h12M4 18h.01M8 18h12', lock: 'M6 10V8a6 6 0 0 1 12 0v2m-1 0H7a2 2 0 0 0-2 2v7h14v-7a2 2 0 0 0-2-2z', menu: 'M4 6h16M4 12h16M4 18h16', close: 'M6 6l12 12M18 6 6 18', arrow: 'm5 12h14m-6-6 6 6-6 6', up: 'm6 15 6-6 6 6', down: 'm6 9 6 6 6-6'
  }
  return <svg viewBox="0 0 24 24" className="icon" aria-hidden="true"><path d={paths[name] || paths.grid} /></svg>
}

function RealMap({ customers }: { customers: Customer[] }) {
  const mapElementRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)
  const markerLayerRef = useRef<L.LayerGroup | null>(null)
  const tileLayerRef = useRef<L.TileLayer | null>(null)
  const [mapStyle, setMapStyle] = useState<'standard' | 'satellite'>('standard')

  useEffect(() => {
    if (!mapElementRef.current || mapInstanceRef.current) return
    const map = L.map(mapElementRef.current, { zoomControl: true }).setView([39.25, -121.02], 12)
    tileLayerRef.current = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map)
    mapInstanceRef.current = map
    markerLayerRef.current = L.layerGroup().addTo(map)
    const resizeTimer = window.setTimeout(() => map.invalidateSize(), 0)
    return () => {
      window.clearTimeout(resizeTimer)
      map.remove()
      mapInstanceRef.current = null
      markerLayerRef.current = null
      tileLayerRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map) return
    tileLayerRef.current?.removeFrom(map)
    tileLayerRef.current = mapStyle === 'satellite'
      ? L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: '&copy; Esri, Maxar, Earthstar Geographics, and the GIS User Community' }).addTo(map)
      : L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map)
  }, [mapStyle])

  useEffect(() => {
    const map = mapInstanceRef.current
    const markerLayer = markerLayerRef.current
    if (!map || !markerLayer) return
    const points = customers.filter(customer => Number.isFinite(customer.lat) && Number.isFinite(customer.lng) && customer.lat !== 0 && customer.lng !== 0)
    const hadMarkers = markerLayer.getLayers().length > 0
    markerLayer.clearLayers()
    const bounds: [number, number][] = []
    points.forEach(customer => {
      const position: [number, number] = [customer.lat, customer.lng]
      bounds.push(position)
      const marker = L.marker(position, { title: formattedAddress(customer), icon: L.divIcon({ className: `district-marker ${customer.current !== null ? 'read' : 'unread'}`, html: `<span>${customer.route || ''}</span>`, iconSize: [28, 28], iconAnchor: [14, 28], popupAnchor: [0, -26] }) }).addTo(markerLayer)
      const popup = document.createElement('div')
      const title = document.createElement('strong')
      title.textContent = formattedAddress(customer)
      const name = document.createElement('span')
      name.textContent = customer.name
      const status = document.createElement('span')
      status.textContent = customer.current === null ? 'Needs reading' : `Read ${formatNumber(customer.current)} CF`
      popup.append(title, name, status)
      marker.bindPopup(popup)
    })
    if (!hadMarkers && bounds.length > 1) map.fitBounds(L.latLngBounds(bounds), { padding: [24, 24] })
    else if (!hadMarkers && bounds.length === 1) map.setView(bounds[0], 15)
    const resizeTimer = window.setTimeout(() => map.invalidateSize(), 0)
    return () => window.clearTimeout(resizeTimer)
  }, [customers])

  return <div className="real-map-wrap"><div ref={mapElementRef} className="real-map" /><div className="map-layer-toggle" role="group" aria-label="Map layer"><button type="button" className={mapStyle === 'standard' ? 'selected' : ''} onClick={() => setMapStyle('standard')}>Map</button><button type="button" className={mapStyle === 'satellite' ? 'selected' : ''} onClick={() => setMapStyle('satellite')}>Satellite</button></div>{customers.length > 0 && !customers.some(customer => customer.lat !== 0 && customer.lng !== 0) && <div className="map-empty-overlay"><Icon name="map" /><strong>Addresses need coordinates</strong><span>Use “Locate address” when editing a customer.</span></div>}{customers.length === 0 && <div className="map-empty-overlay"><Icon name="map" /><strong>No customer addresses yet</strong><span>Add customers to place them on the map.</span></div>}</div>
}

function App({ parseReady = false }: { parseReady?: boolean }) {
  const [view, setView] = useState<View>(() => {
    const validViews: View[] = ['dashboard', 'readings', 'route', 'customers', 'billing', 'users']
    try {
      const savedView = localStorage.getItem('derbyshire-view') as View | null
      return savedView && validViews.includes(savedView) ? savedView : 'dashboard'
    } catch { return 'dashboard' }
  })
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [role, setRole] = useState<Role>('administrator')
  const [customers, setCustomers] = useState<Customer[]>(() => {
    if (parseReady) return []
    try { return JSON.parse(localStorage.getItem('derbyshire-customers') || 'null') || initialCustomers } catch { return initialCustomers }
  })
  const [cycles, setCycles] = useState<ReadingCycle[]>(() => {
    if (parseReady) return []
    try { return JSON.parse(localStorage.getItem('derbyshire-cycles') || 'null') || initialCycles } catch { return initialCycles }
  })
  const [rate, setRate] = useState<RateSchedule>(() => {
    if (parseReady) return RATE
    try { return migrateRate(JSON.parse(localStorage.getItem('derbyshire-rate') || 'null')) } catch { return RATE }
  })
  const [activeCycleId, setActiveCycleId] = useState<string | number>(() => {
    if (parseReady) return ''
    try { return (JSON.parse(localStorage.getItem('derbyshire-cycles') || 'null') || initialCycles)[0]?.id || '' } catch { return initialCycles[0].id }
  })
  const [toast, setToast] = useState('')
  const [editing, setEditing] = useState<Customer | null>(null)
  const [confirmReading, setConfirmReading] = useState<{ customer: Customer; value: number } | null>(null)
  const [authUser, setAuthUser] = useState<Parse.User | null>(() => parseReady ? Parse.User.current() : null)
  const [authChecked, setAuthChecked] = useState(!parseReady)
  const [authError, setAuthError] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [dataLoading, setDataLoading] = useState(parseReady)
  const [users, setUsers] = useState<UserAccount[]>(() => {
    if (parseReady) return []
    try { return JSON.parse(localStorage.getItem('derbyshire-users') || 'null') || initialUsers } catch { return initialUsers }
  })

  useEffect(() => { if (!parseReady) localStorage.setItem('derbyshire-customers', JSON.stringify(customers)) }, [customers, parseReady])
  useEffect(() => { if (!parseReady) localStorage.setItem('derbyshire-cycles', JSON.stringify(cycles)) }, [cycles, parseReady])
  useEffect(() => { if (!parseReady) localStorage.setItem('derbyshire-rate', JSON.stringify(rate)) }, [rate, parseReady])
  useEffect(() => { if (!parseReady) localStorage.setItem('derbyshire-users', JSON.stringify(users)) }, [users, parseReady])
  useEffect(() => { try { localStorage.setItem('derbyshire-view', view) } catch { /* Ignore unavailable browser storage. */ } }, [view])
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(''), 2800); return () => clearTimeout(t) } }, [toast])
  useEffect(() => {
    if (!parseReady) return
    Parse.User.currentAsync().then(user => setAuthUser(user)).catch(() => setAuthUser(null)).finally(() => setAuthChecked(true))
  }, [parseReady])
  useEffect(() => {
    if (!parseReady || !authUser) return
    const isMeterReader = authUser.get('role') === 'meter-reader'
    setRole(isMeterReader ? 'meter-reader' : 'administrator')
    setDataLoading(true)
    Promise.all([
      new Parse.Query('Customer').ascending('route').limit(1000).find(),
      new Parse.Query('ReadingCycle').descending('startDate').limit(100).find(),
      new Parse.Query('RateSchedule').descending('effectiveDate').first(),
      !isMeterReader ? Parse.Cloud.run('adminListUsers') as Promise<UserAccount[]> : Promise.resolve([]),
    ])
      .then(([customerObjects, cycleObjects, rateObject, userObjects]) => {
        setCustomers(customerObjects.map(customerFromParse))
        const loadedCycles = cycleObjects.map(cycleFromParse)
        setCycles(loadedCycles)
        setActiveCycleId(loadedCycles.find(cycle => cycle.status === 'open')?.id || loadedCycles[0]?.id || '')
        if (rateObject) setRate(rateFromParse(rateObject))
        setUsers(userObjects)
      })
      .catch(error => setAuthError(error instanceof Error ? error.message : 'Could not load customer data.'))
      .finally(() => setDataLoading(false))
  }, [parseReady, authUser])

  const unread = customers.filter(c => c.current === null).length
  const readCount = customers.length - unread
  const activeCycle = cycles.find(cycle => cycle.id === activeCycleId) || cycles.find(cycle => cycle.status === 'open') || cycles[0] || null
  const navigate = (next: View) => { setView(next); setMobileMenuOpen(false) }
  const saveReading = async (id: string | number, value: number, confirmed = false) => {
    const customer = customers.find(c => c.id === id)!
    if (value - customer.previous > 8000 && !confirmed) { setConfirmReading({ customer, value }); return }
    if (parseReady && !activeCycle) { setToast('Create a new reading checkpoint before entering readings'); return }
    const updated = { ...customer, current: value, lastRead: today }
    try {
      const saved = parseReady ? await saveCustomerToParse(updated) : updated
      if (parseReady && activeCycle && typeof activeCycle.id === 'string') {
        const customerPointer = new Parse.Object('Customer')
        customerPointer.id = String(saved.id)
        const cyclePointer = new Parse.Object('ReadingCycle')
        cyclePointer.id = activeCycle.id
        const readingQuery = new Parse.Query('MeterReading')
        readingQuery.equalTo('customer', customerPointer)
        readingQuery.equalTo('cycle', cyclePointer)
        const reading = (await readingQuery.first()) || new Parse.Object('MeterReading')
        reading.set('customer', customerPointer)
        reading.set('cycle', cyclePointer)
        reading.set('reading', value)
        reading.set('previousReading', customer.previous)
        reading.set('readAt', today)
        reading.set('reader', Parse.User.current())
        await reading.save()
      }
      setCustomers(items => items.map(c => c.id === id ? saved : c))
      setConfirmReading(null); setToast(`Reading saved for ${formattedAddress(customer)}`)
    } catch (error) { setToast(error instanceof Error ? error.message : 'Could not save reading') }
  }
  const savePreviousReading = async (id: string | number, value: number) => {
    const customer = customers.find(c => c.id === id)
    if (!customer || !Number.isFinite(value) || value < 0) return
    const updated = { ...customer, previous: value }
    try {
      const saved = parseReady ? await saveCustomerToParse(updated) : updated
      setCustomers(items => items.map(item => item.id === id ? saved : item))
      setToast(`Previous reading saved for ${formattedAddress(customer)}`)
    } catch (error) { setToast(error instanceof Error ? error.message : 'Could not save previous reading') }
  }
  const createCycle = async (name: string, startDate: string, dueDate: string, months: number) => {
    try {
      let cycle: ReadingCycle
      if (parseReady) {
        const openCycles = await new Parse.Query('ReadingCycle').equalTo('status', 'open').find()
        await Promise.all(openCycles.map(object => { object.set('status', 'closed'); return object.save() }))
        const object = new Parse.Object('ReadingCycle')
        object.set('name', name)
        object.set('startDate', startDate)
        object.set('dueDate', dueDate)
        object.set('months', months)
        object.set('status', 'open')
        cycle = cycleFromParse(await object.save())
      } else {
        cycle = { id: `cycle-${Date.now()}`, name, startDate, dueDate, months, status: 'open' }
      }
      const resetCustomers = customers.map(customer => ({ ...customer, previous: customer.current ?? customer.previous, current: null, lastRead: null }))
      if (parseReady) await Promise.all(resetCustomers.map(saveCustomerToParse))
      setCustomers(resetCustomers)
      setCycles(items => [cycle, ...items.map(item => item.status === 'open' ? { ...item, status: 'closed' as const } : item)])
      setActiveCycleId(cycle.id)
      setToast(`New reading checkpoint created: ${name}`)
    } catch (error) { setToast(error instanceof Error ? error.message : 'Could not create reading checkpoint') }
  }
  const updateCustomer = async (customer: Customer) => {
    try {
      const normalized = { ...customer, address: formattedAddress(customer) }
      const saved = parseReady ? await saveCustomerToParse(normalized) : normalized
      setCustomers(items => items.some(c => c.id === customer.id) ? items.map(c => c.id === customer.id ? saved : c) : [...items, saved])
      setEditing(null); setToast(parseReady ? 'Customer saved to Back4App' : 'Customer details updated')
    } catch (error) { setToast(error instanceof Error ? error.message : 'Could not save customer') }
  }
  const deleteCustomer = async (customer: Customer) => {
    try {
      if (parseReady && typeof customer.id === 'string' && !customer.id.startsWith('temp-')) {
        const pointer = new Parse.Object('Customer')
        pointer.id = customer.id
        const readings = await new Parse.Query('MeterReading').equalTo('customer', pointer).limit(1000).find()
        if (readings.length) await Parse.Object.destroyAll(readings)
        const object = await new Parse.Query('Customer').get(customer.id)
        await object.destroy()
      }
      setCustomers(items => items.filter(item => item.id !== customer.id))
      setEditing(null)
      setToast(`Customer deleted: ${formattedAddress(customer)}`)
    } catch (error) { setToast(error instanceof Error ? error.message : 'Could not delete customer') }
  }
  const saveRouteOrder = async (ordered: Customer[]) => {
    const updated = ordered.map((customer, index) => ({ ...customer, route: index + 1 }))
    setCustomers(updated)
    if (parseReady) await Promise.all(updated.map(saveCustomerToParse))
    setToast('Reading route updated')
  }
  const moveRoute = async (id: string | number, direction: -1 | 1) => {
    const ordered = [...customers].sort((a, b) => a.route - b.route); const i = ordered.findIndex(c => String(c.id) === String(id)); const j = i + direction
    if (i < 0 || j < 0 || j >= ordered.length) return
    ;[ordered[i], ordered[j]] = [ordered[j], ordered[i]]
    await saveRouteOrder(ordered)
  }
  const reorderRoute = async (fromId: string | number, toId: string | number) => {
    const ordered = [...customers].sort((a, b) => a.route - b.route)
    const fromIndex = ordered.findIndex(customer => String(customer.id) === String(fromId))
    const toIndex = ordered.findIndex(customer => String(customer.id) === String(toId))
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return
    const [dragged] = ordered.splice(fromIndex, 1)
    ordered.splice(toIndex, 0, dragged)
    await saveRouteOrder(ordered)
  }
  const addUser = async (user: Omit<UserAccount, 'id' | 'active' | 'passwordSetAt'>, password: string) => {
    if (parseReady && authUser) {
      try {
        const created = await Parse.Cloud.run('adminCreateUser', { ...user, password }) as UserAccount
        setUsers(items => [...items.filter(item => item.id !== created.id), created].sort((a, b) => a.email.localeCompare(b.email)))
        setToast('User created in Back4App')
      } catch (error) { setToast(error instanceof Error ? error.message : 'Could not create user') }
      return
    }
    setUsers(items => [...items, { ...user, id: Math.max(0, ...items.map(item => typeof item.id === 'number' ? item.id : 0)) + 1, active: true, passwordSetAt: today }])
    setToast('User created in demo mode')
  }
  const toggleUser = async (id: string | number) => {
    if (parseReady) {
      try {
        const current = users.find(item => item.id === id)
        if (!current) return
        const saved = await Parse.Cloud.run('adminSetUserActive', { userId: String(id), active: !current.active }) as UserAccount
        setUsers(items => items.map(item => item.id === id ? saved : item))
        setToast(`User ${saved.active ? 'enabled' : 'disabled'}`)
      } catch (error) { setToast(error instanceof Error ? error.message : 'Could not update user') }
      return
    }
    setUsers(items => items.map(user => user.id === id ? { ...user, active: !user.active } : user))
  }

  const logIn = async (username: string, password: string) => {
    setAuthLoading(true); setAuthError('')
    try { setAuthUser(await Parse.User.logIn(username, password)) }
    catch (error) { setAuthError(error instanceof Error ? error.message : 'Login failed. Check the username and password.') }
    finally { setAuthLoading(false) }
  }
  const logOut = async () => { await Parse.User.logOut(); setAuthUser(null); setCustomers([]); setView('dashboard') }

  if (parseReady && !authChecked) return <LoadingScreen />
  if (parseReady && !authUser) return <LoginScreen onLogin={logIn} loading={authLoading} error={authError} />

  const displayName = parseReady ? (authUser?.get('name') || authUser?.get('username') || 'District staff') : 'District staff'
  const displayInitials = displayName.split(' ').map((part: string) => part[0]).slice(0, 2).join('').toUpperCase()

  return <div className="app-shell">
    <aside className={`sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`}>
      <div className="brand"><div className="brand-mark">D</div><div><strong>Derbyshire</strong><span>Water District</span></div><button className="mobile-close" onClick={() => setMobileMenuOpen(false)}><Icon name="close" /></button></div>
      <div className="workspace-label">WORKSPACE</div>
      <nav>{([
        ['dashboard', 'grid', 'Overview'], ['readings', 'gauge', 'Read meters'], ['route', 'map', 'Route plan'], ['customers', 'users', 'Customers'], ['billing', 'receipt', 'Billing export'], ...(role === 'administrator' ? [['users', 'users', 'Users'] as [View, string, string]] : []),
      ] as [View, string, string][]).map(([key, icon, label]) => <button key={key} className={view === key ? 'nav-item active' : 'nav-item'} onClick={() => navigate(key)}><Icon name={icon} /><span>{label}</span>{key === 'readings' && unread > 0 && <em>{unread}</em>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="secure"><Icon name="lock" /><div><strong>{parseReady ? 'Parse connected' : 'Demo workspace'}</strong><span>{parseReady ? 'Back4App protected' : 'Add env.local'}</span></div></div><div className="user-card"><div className="avatar">{displayInitials}</div><div><strong>{displayName}</strong><span>{role === 'meter-reader' ? 'Meter reader' : 'Administrator'}</span></div><button className="more" title={parseReady ? 'Sign out' : 'Switch role'} onClick={() => parseReady ? logOut() : setRole(role === 'meter-reader' ? 'administrator' : 'meter-reader')}>{parseReady ? '↪' : '↕'}</button></div></div>
    </aside>
    {mobileMenuOpen && <button className="mobile-nav-backdrop" aria-label="Close menu" onClick={() => setMobileMenuOpen(false)} />}
    <main className="main"><header className="topbar"><button className="mobile-menu" aria-label="Open menu" title="Open menu" onClick={() => setMobileMenuOpen(true)}><Icon name="menu" /></button><div className="crumb">{activeCycle?.name || 'No active checkpoint'} <span>·</span> {activeCycle ? `Due ${activeCycle.dueDate}` : 'Create one to begin'}</div><div className="top-actions"><button className="help" aria-label="Help" title="Help">?</button><button className="role-pill" onClick={() => parseReady ? logOut() : setRole(role === 'meter-reader' ? 'administrator' : 'meter-reader')}>{parseReady ? 'Sign out' : role === 'meter-reader' ? 'Meter reader' : 'Administrator'} <span>{parseReady ? '↪' : '⌄'}</span></button></div></header>
      <div className="content">{dataLoading && <div className="data-loading"><span className="loading-dot" /> Loading customer data from Back4App…</div>}{view === 'dashboard' && <Dashboard customers={customers} unread={unread} readCount={readCount} navigate={navigate} rate={rate} activeCycle={activeCycle} userName={displayName} />}{view === 'readings' && <Readings customers={customers} activeCycle={activeCycle} onSave={saveReading} onSavePrevious={savePreviousReading} onCreateCycle={createCycle} />}{view === 'route' && <RoutePlan customers={customers} onMove={moveRoute} onReorder={reorderRoute} onMenu={() => setMobileMenuOpen(true)} />}{view === 'customers' && <Customers customers={customers} onEdit={setEditing} onAdd={() => setEditing({ id: `temp-${Date.now()}`, name: '', address: '', phone: '', email: '', previous: 0, current: null, lastRead: null, route: customers.length + 1, lat: 0, lng: 0 })} />}{view === 'billing' && <Billing customers={customers} activeCycle={activeCycle} rate={rate} canManage={role === 'administrator'} onSaveRate={async nextRate => { try { let object: Parse.Object; if (parseReady && typeof nextRate.id === 'string' && nextRate.id !== 'default-rate') object = await new Parse.Query('RateSchedule').get(nextRate.id); else object = new Parse.Object('RateSchedule'); Object.entries(nextRate).forEach(([key, value]) => { if (key !== 'id') object.set(key, value) }); const saved = parseReady ? rateFromParse(await object.save()) : nextRate; setRate(saved); setToast(parseReady ? 'Rate schedule saved to Back4App' : 'Rate schedule updated') } catch (error) { setToast(error instanceof Error ? error.message : 'Could not save rates') } }} onUpdateCycle={async nextCycle => { if (parseReady && typeof nextCycle.id === 'string' && nextCycle.id !== 'demo-cycle') { const object = await new Parse.Query('ReadingCycle').get(nextCycle.id); object.set('name', nextCycle.name); object.set('startDate', nextCycle.startDate); object.set('dueDate', nextCycle.dueDate); object.set('months', nextCycle.months); await object.save() } setCycles(items => items.map(item => item.id === nextCycle.id ? nextCycle : item)); setToast('Billing period updated') }} />}{view === 'users' && role === 'administrator' && <Users users={users} onAdd={addUser} onToggle={toggleUser} />}</div>
    </main>
    {editing && <CustomerModal customer={editing} onClose={() => setEditing(null)} onSave={updateCustomer} onDelete={deleteCustomer} />}
    {confirmReading && <ConfirmModal customer={confirmReading.customer} value={confirmReading.value} onCancel={() => setConfirmReading(null)} onConfirm={() => saveReading(confirmReading.customer.id, confirmReading.value, true)} />}
    {toast && <div className="toast"><Icon name="check" />{toast}</div>}
  </div>
}

function LoadingScreen() { return <div className="auth-shell"><div className="auth-card loading-card"><div className="brand-mark">D</div><h1>Loading your workspace</h1><p>Checking your Derbyshire Water session…</p><span className="loading-dot large" /></div></div> }
function LoginScreen({ onLogin, loading, error }: { onLogin: (username: string, password: string) => void; loading: boolean; error: string }) { const [username, setUsername] = useState(''); const [password, setPassword] = useState(''); return <div className="auth-shell"><div className="auth-card"><div className="auth-brand"><div className="brand-mark">D</div><div><strong>Derbyshire</strong><span>Water District</span></div></div><div className="eyebrow">SECURE WORKSPACE</div><h1>Welcome back</h1><p className="auth-subtitle">Sign in to read meters, manage customers, and prepare billing.</p><form onSubmit={e => { e.preventDefault(); onLogin(username.trim(), password) }}><label>Username<input autoFocus value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" placeholder="Your Parse username" required /></label><label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" placeholder="Your password" required /></label>{error && <div className="auth-error"><Icon name="alert" />{error}</div>}<button className="primary auth-submit" disabled={loading}>{loading ? 'Signing in…' : 'Sign in'} {!loading && <Icon name="arrow" />}</button></form><div className="auth-footer"><Icon name="lock" /> Protected by Back4App Parse</div></div></div> }
function PageTitle({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) { return <div className="page-title"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action}</div> }
function Dashboard({ customers, unread, readCount, navigate, rate, activeCycle, userName }: { customers: Customer[]; unread: number; readCount: number; navigate: (v: View) => void; rate: RateSchedule; activeCycle: ReadingCycle | null; userName: string }) {
  const percent = customers.length ? Math.round(readCount / customers.length * 100) : 0; const recent = [...customers].filter(c => c.current).sort((a, b) => (b.lastRead || '').localeCompare(a.lastRead || '')).slice(0, 4)
  return <><PageTitle eyebrow={greeting(userName)} title="Cycle overview" description={activeCycle ? `Keep the ${activeCycle.name} reading cycle moving.` : 'Create a checkpoint to start a reading cycle.'} action={<button className="primary" onClick={() => navigate('readings')}><Icon name="plus" /> Add meter reading</button>} />
    <section className="stat-grid"><Stat icon="gauge" label="Cycle progress" value={`${readCount} / ${customers.length}`} detail={`${percent}% complete`} tone="teal" progress={percent} /><Stat icon="alert" label="Still to read" value={String(unread)} detail="addresses remaining" tone="amber" /><Stat icon="receipt" label="Est. cycle total" value={money(customers.reduce((sum, c) => sum + billFor(c, rate).total, 0))} detail="based on current reads" tone="blue" /><Stat icon="users" label="Active accounts" value={String(customers.length)} detail="all residential" tone="slate" /></section>
    <section className="dashboard-grid"><div className="panel progress-panel"><div className="panel-head"><div><h2>Reading progress</h2><p>{activeCycle ? `${activeCycle.name} · due ${activeCycle.dueDate}` : 'No active checkpoint'}</p></div><button className="text-button" onClick={() => navigate('route')}>View route <Icon name="arrow" /></button></div><div className="big-progress"><div className="ring" style={{ '--progress': `${percent * 3.6}deg` } as React.CSSProperties}><div><strong>{percent}%</strong><span>complete</span></div></div><div className="progress-copy"><strong>{readCount} homes read</strong><p>{unread === 0 ? 'All meters are in.' : `${unread} homes are waiting for a reading.`}</p><div className="mini-legend"><span><i className="dot teal" />Read</span><span><i className="dot pale" />Remaining</span></div></div></div><div className="map-preview"><div className="map-lines" />{customers.map(c => <span key={c.id} className={`map-pin ${c.current ? 'done' : ''}`} style={{ left: `${18 + (c.route * 7)}%`, top: `${25 + ((c.route * 17) % 48)}%` }}>{c.route}</span>)}<div className="map-label"><Icon name="map" /> Service addresses <span>·</span> {readCount} read</div></div></div><div className="panel recent-panel"><div className="panel-head"><div><h2>Recent readings</h2><p>Latest activity from the field</p></div><button className="round-button" onClick={() => navigate('readings')}><Icon name="arrow" /></button></div>{recent.map(c => <div className="recent-row" key={c.id}><div className="home-icon"><Icon name="gauge" /></div><div className="recent-info"><strong>{formattedAddress(c)}</strong><span>{c.name}</span></div><div className="reading-value"><strong>{formatNumber(c.current!)}</strong><span>{c.lastRead}</span></div><Icon name="check" /></div>)}<button className="outline-wide" onClick={() => navigate('readings')}>See all readings <Icon name="arrow" /></button></div></section>
  </>
}
function Stat({ icon, label, value, detail, tone, progress }: { icon: string; label: string; value: string; detail: string; tone: string; progress?: number }) { return <div className="stat-card"><div className={`stat-icon ${tone}`}><Icon name={icon} /></div><div><span className="stat-label">{label}</span><strong className="stat-value">{value}</strong><span className="stat-detail">{detail}</span>{progress !== undefined && <div className="thin-progress"><i style={{ width: `${progress}%` }} /></div>}</div></div> }

function Readings({ customers, activeCycle, onSave, onSavePrevious, onCreateCycle }: { customers: Customer[]; activeCycle: ReadingCycle | null; onSave: (id: string | number, value: number) => void; onSavePrevious: (id: string | number, value: number) => Promise<void>; onCreateCycle: (name: string, startDate: string, dueDate: string, months: number) => Promise<void> }) {
  const [query, setQuery] = useState(''); const [filter, setFilter] = useState<'all' | 'unread' | 'read'>('all'); const [sort, setSort] = useState<'route' | 'lastName'>('route'); const [createOpen, setCreateOpen] = useState(false)
  const filtered = customers.filter(c => (c.name + formattedAddress(c)).toLowerCase().includes(query.toLowerCase())).filter(c => filter === 'all' || (filter === 'read' ? c.current !== null : c.current === null)).sort((a, b) => sort === 'lastName' ? lastNameForSort(a.name).localeCompare(lastNameForSort(b.name), 'en', { sensitivity: 'base' }) || a.route - b.route : a.route - b.route)
  return <div className="readings-page"><PageTitle eyebrow="FIELD WORK" title="Read meters" description="Enter the current register reading for each address." action={<button className="primary" onClick={() => setCreateOpen(true)}><Icon name="plus" /> New checkpoint</button>} />{activeCycle ? <div className="callout"><div className="callout-icon"><Icon name="gauge" /></div><div><strong>{activeCycle.name} · {customers.filter(c => c.current === null).length} readings remaining</strong><span>Due {activeCycle.dueDate}. Readings over 8,000 CF above the last reading will ask for confirmation.</span></div><button className="callout-link" onClick={() => setFilter('unread')}>Show remaining <Icon name="arrow" /></button></div> : <div className="callout checkpoint-needed"><div className="callout-icon"><Icon name="alert" /></div><div><strong>Create a reading checkpoint to begin</strong><span>A checkpoint keeps this cycle's readings separate from previous billing periods.</span></div></div>}<div className="toolbar"><div className="search"><Icon name="search" /><input placeholder="Search by name or address" value={query} onChange={e => setQuery(e.target.value)} /></div><div className="filter-tabs">{(['all', 'unread', 'read'] as const).map(key => <button key={key} className={filter === key ? 'selected' : ''} onClick={() => setFilter(key)}>{key === 'all' ? 'All homes' : key === 'unread' ? 'Needs reading' : 'Completed'}</button>)}</div><label className="reading-sort">Sort by<select value={sort} onChange={e => setSort(e.target.value as 'route' | 'lastName')}><option value="route">Route order</option><option value="lastName">Last name A–Z</option></select></label></div><div className="reading-list">{filtered.map((c, i) => <ReadingRow key={c.id} customer={c} index={i} onSave={onSave} onSavePrevious={onSavePrevious} />)}{filtered.length === 0 && <div className="empty">{customers.length === 0 ? 'Add customer accounts before entering readings.' : 'No homes match that search.'}</div>}</div>{createOpen && <CreateCycleModal onClose={() => setCreateOpen(false)} onCreate={async (name, startDate, dueDate, months) => { await onCreateCycle(name, startDate, dueDate, months); setCreateOpen(false) }} />}</div>
}

function CreateCycleModal({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string, startDate: string, dueDate: string, months: number) => Promise<void> }) { const defaultStart = today; const defaultDue = new Date(new Date(`${today}T00:00:00`).getTime() + 120 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10); const [name, setName] = useState(''); const [startDate, setStartDate] = useState(defaultStart); const [dueDate, setDueDate] = useState(defaultDue); const [months, setMonths] = useState('4'); return <div className="modal-backdrop"><form className="modal" onSubmit={async e => { e.preventDefault(); if (!name.trim()) return; await onCreate(name.trim(), startDate, dueDate, Number(months)) }}><div className="modal-head"><div><div className="eyebrow">FIELD WORK</div><h2>New reading checkpoint</h2></div><button type="button" onClick={onClose}><Icon name="close" /></button></div><p className="modal-intro">Start a fresh meter-reading period. Existing readings become each account's previous reading, and the new checkpoint starts empty.</p><div className="form-grid"><label>Checkpoint name<input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="e.g. January 2027" required /></label><label>Billing months<input type="number" min="1" max="12" value={months} onChange={e => setMonths(e.target.value)} required /></label><label>Start date<input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required /></label><label>Due date<input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} required /></label></div><div className="modal-foot"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button type="submit" className="primary" disabled={!name.trim()}>Create checkpoint</button></div></form></div> }
function ReadingRow({ customer, index, onSave, onSavePrevious }: { customer: Customer; index: number; onSave: (id: string | number, value: number) => void; onSavePrevious: (id: string | number, value: number) => Promise<void> }) {
  const [previousValue, setPreviousValue] = useState(String(customer.previous))
  const [value, setValue] = useState(customer.current === null ? '' : String(customer.current))
  useEffect(() => { setPreviousValue(String(customer.previous)) }, [customer.id, customer.previous])
  useEffect(() => { setValue(customer.current === null ? '' : String(customer.current)) }, [customer.id, customer.current])
  const previousChanged = Number(previousValue) !== customer.previous
  const currentChanged = Number(value) !== customer.current
  const netUsage = value === '' ? null : Number(value) - Number(previousValue)
  return <div className={`reading-row ${customer.current !== null ? 'complete' : ''}`}><div className="route-number">{customer.route}</div><div className="address-block"><strong>{addressParts(customer).line1 || customer.address}</strong><span>{customer.name}</span></div><div className="previous"><span>Previous (CF)</span><div className="input-wrap"><input inputMode="numeric" aria-label={`Previous reading for ${customer.name}`} value={previousValue} onChange={e => setPreviousValue(e.target.value.replace(/[^0-9]/g, ''))} /><span>CF</span></div></div><div className="reading-input"><span>Current reading (CF)</span><div className="input-wrap"><input inputMode="numeric" value={value} placeholder="Enter reading" onChange={e => setValue(e.target.value.replace(/[^0-9]/g, ''))} /><span>CF</span></div>{netUsage !== null && netUsage > 8000 && <small className="warning-text"><Icon name="alert" /> +{formatNumber(netUsage)} CF</small>}</div><div className="net-usage"><span>Net usage</span><strong className={netUsage !== null && netUsage < 0 ? 'negative' : ''}>{netUsage === null ? '—' : `${netUsage < 0 ? '−' : ''}${formatNumber(Math.abs(netUsage))} CF`}</strong></div><div className="row-action">{previousChanged ? <button className="save-button" onClick={() => onSavePrevious(customer.id, Number(previousValue))}>Save previous</button> : currentChanged && value ? <button className="save-button" onClick={() => onSave(customer.id, Number(value))}>{customer.current !== null ? 'Update reading' : 'Save reading'}</button> : customer.current !== null ? <span className="saved"><Icon name="check" /> Saved</span> : <span className="muted">Enter current reading</span>}</div></div>
}

function RoutePlan({ customers, onMove, onReorder, onMenu }: { customers: Customer[]; onMove: (id: string | number, direction: -1 | 1) => void; onReorder: (fromId: string | number, toId: string | number) => Promise<void>; onMenu: () => void }) { const [fullMapOpen, setFullMapOpen] = useState(false); const [draggingId, setDraggingId] = useState<string | number | null>(null); const [dragOverId, setDragOverId] = useState<string | number | null>(null); const ordered = [...customers].sort((a, b) => a.route - b.route); const clearDrag = () => { setDraggingId(null); setDragOverId(null) }; const startDrag = (event: React.DragEvent<HTMLDivElement>, id: string | number) => { setDraggingId(id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', String(id)) }; const dropOn = async (event: React.DragEvent<HTMLDivElement>, targetId: string | number) => { event.preventDefault(); const sourceId = draggingId ?? event.dataTransfer.getData('text/plain'); if (sourceId) await onReorder(sourceId, targetId); clearDrag() }; return <><PageTitle eyebrow="FIELD WORK" title="Route plan" description="Set the order your meter reader visits each home." action={<button className="primary" onClick={() => setFullMapOpen(true)}><Icon name="map" /> Open full map</button>} /><div className="route-layout"><div className="panel route-map"><div className="map-top"><div><h2>Coverage map</h2><p>Real customer locations · OpenStreetMap</p></div><div className="map-key"><span><i className="dot teal" />Read</span><span><i className="dot amber" />To do</span></div></div><RealMap customers={customers} /></div><div className="panel route-list"><div className="panel-head"><div><h2>Visit order</h2><p>Drag a row to reorder, or use the arrows.</p></div><Icon name="sort" /></div>{ordered.map((c, i) => <div className={`route-item ${String(draggingId) === String(c.id) ? 'dragging' : ''} ${String(dragOverId) === String(c.id) ? 'drag-over' : ''}`} key={c.id} draggable onDragStart={event => startDrag(event, c.id)} onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDragOverId(c.id) }} onDrop={event => dropOn(event, c.id)} onDragEnd={clearDrag}><span className="route-index">{i + 1}</span><span className="drag-handle" title="Drag to reorder" aria-label="Drag to reorder"><Icon name="sort" /></span><div className="route-address"><strong>{formattedAddress(c)}</strong><span>{c.name}</span></div><span className={c.current ? 'status-done' : 'status-todo'}>{c.current ? 'Read' : 'To do'}</span><div className="route-arrows"><button type="button" disabled={i === 0} onClick={() => onMove(c.id, -1)} aria-label={`Move ${formattedAddress(c)} up`}><Icon name="up" /></button><button type="button" disabled={i === ordered.length - 1} onClick={() => onMove(c.id, 1)} aria-label={`Move ${formattedAddress(c)} down`}><Icon name="down" /></button></div></div>)}</div></div>{fullMapOpen && <FullMapModal customers={customers} onClose={() => setFullMapOpen(false)} onMenu={onMenu} />}</> }

function FullMapModal({ customers, onClose, onMenu }: { customers: Customer[]; onClose: () => void; onMenu: () => void }) { const [filter, setFilter] = useState<'all' | 'read' | 'todo'>('all'); const shown = customers.filter(customer => filter === 'all' || (filter === 'read' ? customer.current !== null : customer.current === null)); return <div className="full-map-backdrop"><div className="full-map-modal"><div className="full-map-head"><button className="mobile-menu full-map-menu" aria-label="Open menu" title="Open menu" onClick={onMenu}><Icon name="menu" /></button><div><div className="eyebrow">FIELD WORK</div><h2>Full route map</h2><p>{shown.length} of {customers.length} service addresses shown</p></div><button className="full-map-close" onClick={onClose}><Icon name="close" /></button></div><div className="full-map-toolbar"><div className="filter-tabs">{(['all', 'read', 'todo'] as const).map(key => <button key={key} className={filter === key ? 'selected' : ''} onClick={() => setFilter(key)}>{key === 'all' ? 'All addresses' : key === 'read' ? 'Read' : 'Needs reading'}</button>)}</div><div className="map-key"><span><i className="dot teal" />Read</span><span><i className="dot amber" />Needs reading</span></div></div><div className="full-map-body"><RealMap customers={shown} /><div className="full-map-list">{shown.sort((a, b) => a.route - b.route).map(customer => <div className="full-map-item" key={customer.id}><span className="route-index">{customer.route}</span><div><strong>{formattedAddress(customer)}</strong><span>{customer.name}</span></div><span className={customer.current !== null ? 'status-done' : 'status-todo'}>{customer.current !== null ? 'Read' : 'To do'}</span></div>)}{shown.length === 0 && <div className="empty">No addresses in this filter.</div>}</div></div></div></div> }

function Customers({ customers, onEdit, onAdd }: { customers: Customer[]; onEdit: (customer: Customer) => void; onAdd: () => void }) {
  const [query, setQuery] = useState('')
  const shown = customers.filter(c => (c.name + formattedAddress(c) + formattedAddress(c, true)).toLowerCase().includes(query.toLowerCase()))
  return <>
    <PageTitle eyebrow="ADMINISTRATION" title="Customers" description="Manage household details and account contacts." action={<button className="primary" onClick={onAdd}><Icon name="plus" /> Add customer</button>} />
    <div className="toolbar"><div className="search"><Icon name="search" /><input placeholder="Search customers or addresses" value={query} onChange={e => setQuery(e.target.value)} /></div><button className="secondary customer-export-button" onClick={() => exportCustomersXlsx(customers)}><Icon name="download" /> Export XLSX</button></div>
    <div className="panel customer-table"><div className="table-head"><span>Customer</span><span>Contact</span><span>Last reading</span><span>Account</span><span /></div>{shown.map(c => <div className="customer-row" key={c.id}><div className="customer-name"><div className="avatar small">{c.name.split(' ').map(n => n[0]).slice(0, 2).join('')}</div><div><strong>{c.name}</strong><span>{formattedAddress(c)}</span><small className="billing-preview">Bill to: {formattedAddress(c, true)}</small></div></div><div className="contact"><span>{c.phone}</span><span>{c.email}</span></div><div className="last-read">{c.lastRead ? <><strong>{c.lastRead}</strong><span>{formatNumber(c.current!)} CF</span></> : <span className="muted">Not read this cycle</span>}</div><span className="account-status">Active</span><button className="edit-button" onClick={() => onEdit(c)}><Icon name="edit" /> Edit</button></div>)}</div>
    {shown.length === 0 && <div className="empty">No customer records yet. Add your first household to begin.</div>}
  </>
}

function billFor(c: Customer, rate: RateSchedule, months = 4) { const usage = c.current === null ? 0 : Math.max(0, c.current - c.previous); const tierOneUnits = Math.max(0, Math.min(usage, rate.tierOneEnd) - rate.included); const tierTwoUnits = Math.max(0, usage - rate.tierOneEnd); const tierOneAmount = Math.ceil(tierOneUnits / 100) * rate.tierOne; const tierTwoAmount = Math.ceil(tierTwoUnits / 100) * rate.tierTwo; const maintenance = rate.maintenanceMonthly * months; const boardMemberDiscount = c.boardMember === true ? rate.boardMemberDiscount : 0; return { usage, tierOneUnits, tierTwoUnits, tierOneAmount, tierTwoAmount, maintenance, boardMemberDiscount, total: rate.base + maintenance + tierOneAmount + tierTwoAmount - boardMemberDiscount } }
function Billing({ customers, activeCycle, rate, canManage, onSaveRate, onUpdateCycle }: { customers: Customer[]; activeCycle: ReadingCycle | null; rate: RateSchedule; canManage: boolean; onSaveRate: (rate: RateSchedule) => Promise<void>; onUpdateCycle: (cycle: ReadingCycle) => Promise<void> }) {
  const period = activeCycle ? `${activeCycle.startDate} – ${activeCycle.dueDate}` : 'No active checkpoint'
  const months = activeCycle?.months || 4
  const rows = customers.filter(c => c.current !== null).sort((a, b) => lastNameForSort(a.name).localeCompare(lastNameForSort(b.name), 'en', { sensitivity: 'base' }) || a.route - b.route)
  const total = rows.reduce((sum, c) => sum + billFor(c, rate, months).total, 0)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const exportCsv = () => {
    const header = 'Customer,Service address,Billing address,Invoice period,Item,Description,Quantity,Rate,Amount'
    const body = rows.flatMap(c => {
      const b = billFor(c, rate, months)
      const service = formattedAddress(c)
      const billing = formattedAddress(c, true)
      return [
        [c.name, service, billing, period, 'WATER-BASE', `Base charge (includes first ${formatNumber(rate.included)} CF)`, 1, rate.base, rate.base],
        [c.name, service, billing, period, 'MAINTENANCE', `Maintenance surcharge (${months} months)`, months, rate.maintenanceMonthly, b.maintenance],
        ...(b.boardMemberDiscount > 0 ? [[c.name, service, billing, period, 'BOARD-DISCOUNT', 'Board member base-rate discount', 1, -rate.boardMemberDiscount, -b.boardMemberDiscount]] : []),
        ...(b.tierOneUnits ? [[c.name, service, billing, period, 'WATER-TIER-1', `Usage ${rate.included + 1}–${rate.tierOneEnd} CF`, Math.ceil(b.tierOneUnits / 100), rate.tierOne, b.tierOneAmount]] : []),
        ...(b.tierTwoUnits ? [[c.name, service, billing, period, 'WATER-TIER-2', `Usage ${rate.tierOneEnd + 1}+ CF`, Math.ceil(b.tierTwoUnits / 100), rate.tierTwo, b.tierTwoAmount]] : []),
      ]
    }).map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(','))
    const blob = new Blob([[header, ...body].join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'derbyshire-water-quickbooks-export.csv'
    anchor.click()
    URL.revokeObjectURL(url)
  }
  return <>
    <PageTitle eyebrow="ADMINISTRATION" title="Billing export" description="Review line items, then download a QuickBooks-ready CSV." action={<button className="primary" onClick={exportCsv}><Icon name="download" /> Download CSV</button>} />
    <div className="billing-controls"><label>Billing period<input value={period} readOnly /></label><div className="billing-summary"><span>{rows.length} invoices ready</span><strong>{money(total)}</strong><small>estimated total</small></div></div>
    <div className="rate-banner"><div className="rate-badge">$</div><div><strong>Current rate schedule</strong><span>Base {money(rate.base)} / cycle · Includes first {formatNumber(rate.included)} CF · Maintenance {money(rate.maintenanceMonthly)} / month · Board member discount {money(rate.boardMemberDiscount)} / cycle · Usage billed per 100 CF</span></div>{canManage && <button onClick={() => setSettingsOpen(true)}>Manage rates & period <Icon name="arrow" /></button>}</div>
    <div className="panel billing-table"><div className="table-head"><span>Customer</span><span>Usage (CF)</span><span>Line-item breakdown</span><span>Total</span></div>{rows.map(c => { const b = billFor(c, rate, months); return <div className="billing-row" key={c.id}><div><strong>{c.name}</strong><span>{formattedAddress(c, true)}</span>{c.boardMember && <span className="board-member-label">Board member</span>}</div><div><strong>{formatNumber(b.usage)} CF</strong><span>Current {formatNumber(c.current!)} CF</span></div><div className="line-items"><span>Base <b>{money(rate.base)}</b></span><span>Maintenance ({months} mo) <b>{money(b.maintenance)}</b></span>{b.boardMemberDiscount > 0 && <span>Board member discount <b>{money(-b.boardMemberDiscount)}</b></span>}{b.tierOneAmount > 0 && <span>Tier 1 · {formatNumber(b.tierOneUnits)} CF <b>{money(b.tierOneAmount)}</b></span>}{b.tierTwoAmount > 0 && <span>Tier 2 · {formatNumber(b.tierTwoUnits)} CF <b>{money(b.tierTwoAmount)}</b></span>}</div><strong className="bill-total">{money(b.total)}</strong></div>})}</div>
    <p className="billing-note">Meter usage is measured in CF. Usage rates are applied per 100 CF, with each tier rounded up to the next 100 CF. Board member discounts apply to the base charge per billing period. Billing period and rates are editable by administrators.</p>
    {settingsOpen && <BillingSettingsModal rate={rate} cycle={activeCycle} onClose={() => setSettingsOpen(false)} onSaveRate={onSaveRate} onUpdateCycle={onUpdateCycle} />}
  </>
}

function Users({ users, onAdd, onToggle }: { users: UserAccount[]; onAdd: (user: Omit<UserAccount, 'id' | 'active' | 'passwordSetAt'>, password: string) => void; onToggle: (id: string | number) => void }) {
  const [formOpen, setFormOpen] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [newRole, setNewRole] = useState<Role>('meter-reader')
  const [password, setPassword] = useState('')
  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!name.trim() || !email.trim() || password.length < 8) return
    onAdd({ name: name.trim(), email: email.trim(), role: newRole }, password)
    setName(''); setEmail(''); setPassword(''); setNewRole('meter-reader'); setFormOpen(false)
  }
  return <><PageTitle eyebrow="ADMINISTRATION" title="Users & access" description="Invite meter readers and manage administrator access." action={<button className="primary" onClick={() => setFormOpen(true)}><Icon name="plus" /> Add user</button>} />
    <div className="access-banner"><div className="access-banner-icon"><Icon name="lock" /></div><div><strong>Authentication is managed by Parse Cloud Code</strong><span>Passwords are sent directly to a server-side Cloud Function and are never returned to this browser.</span></div></div>
    <div className="panel users-table"><div className="table-head user-table-head"><span>User</span><span>Role</span><span>Password</span><span>Status</span><span /></div>{users.map(user => <div className="user-row" key={user.id}><div className="customer-name"><div className="avatar small">{user.name.split(' ').map(n => n[0]).slice(0, 2).join('')}</div><div><strong>{user.name}</strong><span>{user.email}</span></div></div><span className={`role-tag ${user.role}`}>{user.role === 'administrator' ? 'Administrator' : 'Meter reader'}</span><span className="password-state">Set {user.passwordSetAt}<button>Reset</button></span><button className={user.active ? 'active-state' : 'inactive-state'} onClick={() => onToggle(user.id)}>{user.active ? 'Active' : 'Disabled'}</button><button className="edit-button">⋯</button></div>)}</div>
    {formOpen && <div className="modal-backdrop"><form className="modal" onSubmit={submit}><div className="modal-head"><div><div className="eyebrow">ACCESS MANAGEMENT</div><h2>Add a user</h2></div><button type="button" onClick={() => setFormOpen(false)}><Icon name="close" /></button></div><p className="modal-intro">Create a login for a meter reader or another administrator. Use at least 8 characters for the initial password.</p><div className="form-grid"><label>Full name<input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Taylor Morgan" required /></label><label>Email address<input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="taylor@example.com" required /></label><label>Role<select value={newRole} onChange={e => setNewRole(e.target.value as Role)}><option value="meter-reader">Meter reader</option><option value="administrator">Administrator</option></select></label><label>Initial password<input type="password" minLength={8} value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" required /></label></div><div className="modal-foot"><button type="button" className="secondary" onClick={() => setFormOpen(false)}>Cancel</button><button type="submit" className="primary" disabled={password.length < 8 || !name || !email}>Create user</button></div></form></div>}
  </>
}

function BillingSettingsModal({ rate, cycle, onClose, onSaveRate, onUpdateCycle }: { rate: RateSchedule; cycle: ReadingCycle | null; onClose: () => void; onSaveRate: (rate: RateSchedule) => Promise<void>; onUpdateCycle: (cycle: ReadingCycle) => Promise<void> }) {
  const [draft, setDraft] = useState(rate)
  const [cycleDraft, setCycleDraft] = useState(cycle)
  const [saving, setSaving] = useState(false)
  const setRate = (key: keyof RateSchedule, value: string) => setDraft({ ...draft, [key]: key === 'effectiveDate' ? value : Number(value) })
  const setCycle = (key: keyof ReadingCycle, value: string) => setCycleDraft(cycleDraft ? { ...cycleDraft, [key]: key === 'months' ? Number(value) : value } : cycleDraft)
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    await onSaveRate(draft)
    if (cycleDraft) await onUpdateCycle(cycleDraft)
    setSaving(false)
    onClose()
  }
  return <div className="modal-backdrop"><form className="modal billing-settings" onSubmit={submit}>
    <div className="modal-head"><div><div className="eyebrow">ADMINISTRATION</div><h2>Rates & billing period</h2></div><button type="button" onClick={onClose}><Icon name="close" /></button></div>
    <div className="settings-section"><h3>Rate schedule</h3><div className="form-grid">
      <label>Base charge<input type="number" step="0.01" value={draft.base} onChange={e => setRate('base', e.target.value)} /></label>
      <label>Board member discount / billing period<input type="number" step="0.01" value={draft.boardMemberDiscount} onChange={e => setRate('boardMemberDiscount', e.target.value)} /></label>
      <label>Effective date<input type="date" value={draft.effectiveDate} onChange={e => setRate('effectiveDate', e.target.value)} /></label>
      <label>Maintenance / month<input type="number" step="0.01" value={draft.maintenanceMonthly} onChange={e => setRate('maintenanceMonthly', e.target.value)} /></label>
      <label>Included usage (CF)<input type="number" value={draft.included} onChange={e => setRate('included', e.target.value)} /></label>
      <label>Tier 1 ends (CF)<input type="number" value={draft.tierOneEnd} onChange={e => setRate('tierOneEnd', e.target.value)} /></label>
      <label>Tier 1 / 100 CF<input type="number" step="0.01" value={draft.tierOne} onChange={e => setRate('tierOne', e.target.value)} /></label>
      <label>Tier 2 / 100 CF<input type="number" step="0.01" value={draft.tierTwo} onChange={e => setRate('tierTwo', e.target.value)} /></label>
    </div></div>
    {cycleDraft ? <div className="settings-section"><h3>Active billing period</h3><div className="form-grid"><label>Checkpoint name<input value={cycleDraft.name} onChange={e => setCycle('name', e.target.value)} /></label><label>Billing months<input type="number" min="1" max="12" value={cycleDraft.months} onChange={e => setCycle('months', e.target.value)} /></label><label>Start date<input type="date" value={cycleDraft.startDate} onChange={e => setCycle('startDate', e.target.value)} /></label><label>Due date<input type="date" value={cycleDraft.dueDate} onChange={e => setCycle('dueDate', e.target.value)} /></label></div></div> : <div className="settings-empty">Create a reading checkpoint first to manage its billing period.</div>}
    <div className="modal-foot"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button type="submit" className="primary" disabled={saving}>{saving ? 'Saving…' : 'Save settings'}</button></div>
  </form></div>
}

function CustomerModal({ customer, onClose, onSave, onDelete }: { customer: Customer; onClose: () => void; onSave: (c: Customer) => void; onDelete: (c: Customer) => Promise<void> }) {
  const service = addressParts(customer)
  const billing = addressParts(customer, true)
  const [draft, setDraft] = useState({ ...customer, boardMember: customer.boardMember === true, serviceAddress1: service.line1, serviceAddress2: service.line2, serviceCity: service.city, serviceState: service.state, serviceZip: service.zip, billingSameAsService: customer.billingSameAsService !== false, billingAddress1: billing.line1, billingAddress2: billing.line2, billingCity: billing.city, billingState: billing.state, billingZip: billing.zip })
  const [locating, setLocating] = useState(false)
  const [locationMessage, setLocationMessage] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const set = (key: keyof Customer, value: string | boolean) => setDraft({ ...draft, [key]: value })
  const locate = async () => {
    const query = formattedAddress(draft)
    if (!query.trim()) return
    setLocating(true)
    setLocationMessage('')
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=us&q=${encodeURIComponent(query)}`, { headers: { Accept: 'application/json' } })
      if (!response.ok) throw new Error('Geocoding service unavailable')
      const results = await response.json() as Array<{ lat: string; lon: string }>
      if (!results[0]) { setLocationMessage('No match found. Include city, state, and ZIP.'); return }
      setDraft({ ...draft, lat: Number(results[0].lat), lng: Number(results[0].lon), address: query })
      setLocationMessage('Location found. Save the customer to keep it.')
    } catch (error) {
      setLocationMessage(error instanceof Error ? error.message : 'Could not locate this address.')
    } finally {
      setLocating(false)
    }
  }
  const sameBilling = draft.billingSameAsService !== false
  return <div className="modal-backdrop"><div className="modal address-modal">
    <div className="modal-head"><div><div className="eyebrow">CUSTOMER ACCOUNT</div><h2>{String(customer.id).startsWith('temp-') ? 'Add customer' : 'Edit customer'}</h2></div><button onClick={onClose}><Icon name="close" /></button></div>
    <div className="form-grid"><label>Customer name<input value={draft.name} onChange={e => set('name', e.target.value)} required /></label><label>Phone<input value={draft.phone} onChange={e => set('phone', e.target.value)} /></label><label>Email<input type="email" value={draft.email} onChange={e => set('email', e.target.value)} /></label></div>
    <label className="same-address board-member-toggle"><input type="checkbox" checked={draft.boardMember === true} onChange={e => set('boardMember', e.target.checked)} /> Board member <span>Applies the configured base-rate discount.</span></label>
    <div className="address-section"><h3>Service address</h3><div className="address-grid"><label>Address 1<input value={draft.serviceAddress1 || ''} onChange={e => { set('serviceAddress1', e.target.value); setLocationMessage('') }} required /></label><label>Address 2<input value={draft.serviceAddress2 || ''} onChange={e => { set('serviceAddress2', e.target.value); setLocationMessage('') }} /></label><label>City<input value={draft.serviceCity || ''} onChange={e => { set('serviceCity', e.target.value); setLocationMessage('') }} required /></label><label>State<input value={draft.serviceState || ''} onChange={e => { set('serviceState', e.target.value); setLocationMessage('') }} required /></label><label>ZIP<input value={draft.serviceZip || ''} onChange={e => { set('serviceZip', e.target.value); setLocationMessage('') }} required /></label></div><button type="button" className="locate-button" onClick={locate} disabled={locating || !formattedAddress(draft).trim()}><Icon name="map" /> {locating ? 'Locating…' : draft.lat !== 0 ? 'Update service location' : 'Locate service address'}</button>{locationMessage && <small className="location-message">{locationMessage}</small>}</div>
    <label className="same-address"><input type="checkbox" checked={sameBilling} onChange={e => set('billingSameAsService', e.target.checked)} /> Billing address is the same as service address</label>
    {!sameBilling && <div className="address-section"><h3>Billing address</h3><div className="address-grid"><label>Address 1<input value={draft.billingAddress1 || ''} onChange={e => set('billingAddress1', e.target.value)} required /></label><label>Address 2<input value={draft.billingAddress2 || ''} onChange={e => set('billingAddress2', e.target.value)} /></label><label>City<input value={draft.billingCity || ''} onChange={e => set('billingCity', e.target.value)} required /></label><label>State<input value={draft.billingState || ''} onChange={e => set('billingState', e.target.value)} required /></label><label>ZIP<input value={draft.billingZip || ''} onChange={e => set('billingZip', e.target.value)} required /></label></div></div>}
    <div className="modal-foot customer-modal-foot">{!String(customer.id).startsWith('temp-') && <button type="button" className="danger-button" onClick={() => setDeleteOpen(true)}><Icon name="trash" /> Delete customer</button>}<span className="modal-foot-spacer" /><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" onClick={() => onSave({ ...draft, address: formattedAddress(draft), billingSameAsService: sameBilling })}>Save customer</button></div>
  </div>{deleteOpen && <div className="modal-backdrop nested-backdrop"><div className="modal confirm-modal"><div className="alert-circle danger-circle"><Icon name="trash" /></div><div className="eyebrow">DELETE CUSTOMER</div><h2>Delete this customer?</h2><p>This will permanently remove <strong>{draft.name || formattedAddress(draft)}</strong> and its meter-reading history from Parse.</p><div className="modal-foot"><button className="secondary" onClick={() => setDeleteOpen(false)}>Cancel</button><button className="danger-solid" onClick={() => onDelete(customer)}>Delete permanently</button></div></div></div>}</div>
}
function ConfirmModal({ customer, value, onCancel, onConfirm }: { customer: Customer; value: number; onCancel: () => void; onConfirm: () => void }) { const delta = value - customer.previous; return <div className="modal-backdrop"><div className="modal confirm-modal"><div className="alert-circle"><Icon name="alert" /></div><div className="eyebrow">PLEASE CONFIRM</div><h2>That reading is unusually high</h2><p>This reading is <strong>{formatNumber(delta)} CF</strong> above the previous reading for {formattedAddress(customer)}. Please double-check the meter before saving.</p><div className="comparison"><div><span>Previous</span><strong>{formatNumber(customer.previous)} CF</strong></div><Icon name="arrow" /><div><span>New reading</span><strong>{formatNumber(value)} CF</strong></div></div><div className="modal-foot"><button className="secondary" onClick={onCancel}>Go back</button><button className="primary" onClick={onConfirm}>Confirm reading</button></div></div></div> }

export default App
