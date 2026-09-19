export interface CartItem {
  id: string
  listingId: string
  productCode: string
  productName: string
  thumbUrl: string | null
  unitPrice: number
  qty: number
  lineTotal: number
  customNote: string | null
  status: string
  unavailable: boolean
  maxQty: number | null
  components: { componentId: string; name: string; extraPrice: number }[]
}

export interface CartData {
  marketDayId: string
  stalls: {
    stall: { id: string; name: string; boothNo: string }
    items: CartItem[]
    subtotal: number
  }[]
  itemCount: number
  total: number
  hasUnavailable: boolean
}

export interface OrderSubOrder {
  id: string
  stall: { id: string; name: string }
  boothNo: string
  pickupCode: string
  status: 'PENDING_CONFIRM' | 'PENDING' | 'PICKED_UP' | 'NO_SHOW' | 'CANCELLED'
  confirmedAt?: string | null
  subtotal: number
  pickedUpAt: string | null
  items: {
    productCode: string
    productName: string
    unitPrice: number
    qty: number
    lineTotal: number
    customNote: string | null
    components: { name: string; extraPrice: number }[]
  }[]
}

export interface OrderDetail {
  id: string
  marketDay: {
    id: string
    eventDate: string
    openTime: string
    closeTime: string
    location: string
    marketName: string
    locationNote: string | null
    status: string
  }
  contactName: string
  contactPhone: string
  pickupAt: string
  note: string | null
  totalAmount: number
  createdAt: string
  subOrders: OrderSubOrder[]
}

export interface OrderListItem {
  id: string
  marketDay: { id: string; eventDate: string; marketName: string; location: string }
  pickupAt: string
  totalAmount: number
  stallCount: number
  statuses: string[]
  createdAt: string
}
