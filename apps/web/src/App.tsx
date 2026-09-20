import { Navigate, Route, Routes } from 'react-router-dom'
import ImpersonationBar from '@/components/ImpersonationBar'
import { ImpersonationProvider } from '@/store/impersonation'
import { SessionProvider } from '@/store/session'
import CustomerLayout from '@/routes/customer/Layout'
import Login from '@/routes/customer/Login'
import MarketDayList from '@/routes/customer/MarketDayList'
import MarketHome from '@/routes/customer/MarketHome'
import Cart from '@/routes/customer/Cart'
import Checkout from '@/routes/customer/Checkout'
import CustomerOrderDetail from '@/routes/customer/OrderDetail'
import MarketDayPage from '@/routes/customer/MarketDayPage'
import MyOrders from '@/routes/customer/MyOrders'
import ProductDetail from '@/routes/customer/ProductDetail'
import StallPage from '@/routes/customer/StallPage'
import OperatorLayout from '@/routes/operator/Layout'
import MarketDayDetail from '@/routes/operator/MarketDayDetail'
import MarketDays from '@/routes/operator/MarketDays'
import Markets from '@/routes/operator/Markets'
import Permissions from '@/routes/operator/Permissions'
import OperatorBroadcastDetail from '@/routes/operator/BroadcastDetail'
import OperatorBroadcasts from '@/routes/operator/Broadcasts'
import OperatorDashboard from '@/routes/operator/Dashboard'
import OperatorDayOrders from '@/routes/operator/DayOrders'
import OperatorListings from '@/routes/operator/Listings'
import OperatorSettings from '@/routes/operator/Settings'
import OperatorStalls from '@/routes/operator/Stalls'
import StallLayout from '@/routes/stall/Layout'
import StallHome from '@/routes/stall/StallHome'
import StallListings from '@/routes/stall/Listings'
import StallProductEdit from '@/routes/stall/ProductEdit'
import StallBroadcasts from '@/routes/stall/Broadcasts'
import StallPickup from '@/routes/stall/Pickup'
import StallPrepSheet from '@/routes/stall/PrepSheet'
import StallProducts from '@/routes/stall/Products'
import StallProfilePage from '@/routes/stall/Profile'
import StallSubOrderDetail from '@/routes/stall/SubOrderDetail'
import StallSubOrders from '@/routes/stall/SubOrders'
import Redeem from '@/routes/stall/Redeem'
import { RequireCapability } from '@/routes/guard'

/**
 * 三個 view 在同一個 app，用路由前綴分（D-13）：
 *   /          顧客
 *   /stall     攤商
 *   /operator  廠商
 * 27 個畫面（05-畫面規格.md）全部實作完成；另有規格外的 C0 市集入口。
 */
export default function App() {
  return (
    <SessionProvider>
      <ImpersonationProvider>
        <ImpersonationBar />
        <Routes>
          {/* 顧客 View */}
          <Route element={<CustomerLayout />}>
            <Route index element={<MarketHome />} />
            <Route path="markets/:marketId" element={<MarketDayList />} />
            <Route path="login" element={<Login />} />
            <Route path="days/:dayId" element={<MarketDayPage />} />
            <Route path="days/:dayId/products/:listingId" element={<ProductDetail />} />
            <Route path="days/:dayId/stalls/:stallId" element={<StallPage />} />
            <Route path="days/:dayId/cart" element={<Cart />} />
            <Route path="days/:dayId/checkout" element={<Checkout />} />
            <Route path="orders" element={<MyOrders />} />
            <Route path="orders/:id" element={<CustomerOrderDetail />} />
          </Route>

          {/* 攤商 View */}
          <Route
            path="stall"
            element={
              <RequireCapability capability="stall">
                <StallLayout />
              </RequireCapability>
            }
          >
            <Route index element={<StallHome />} />
            <Route path=":stallId/profile" element={<StallProfilePage />} />
            <Route path=":stallId/products" element={<StallProducts />} />
            <Route path=":stallId/products/:id" element={<StallProductEdit />} />
            <Route path=":stallId/days/:dayId/listings" element={<StallListings />} />
            <Route path=":stallId/days/:dayId/orders" element={<StallSubOrders />} />
            <Route path=":stallId/sub-orders/:id" element={<StallSubOrderDetail />} />
            <Route path=":stallId/days/:dayId/prep" element={<StallPrepSheet />} />
            <Route path=":stallId/days/:dayId/pickup" element={<StallPickup />} />
            <Route path=":stallId/broadcasts" element={<StallBroadcasts />} />
          </Route>

          {/* 邀請碼綁定：還不是攤商成員的人也要進得來，因此不套 stall 守門 */}
          <Route
            path="stall/redeem"
            element={
              <RequireCapability capability="customer">
                <StallLayout />
              </RequireCapability>
            }
          >
            <Route index element={<Redeem />} />
          </Route>

          {/* 廠商 CMS */}
          <Route
            path="operator"
            element={
              <RequireCapability capability="operator">
                <OperatorLayout />
              </RequireCapability>
            }
          >
            <Route index element={<OperatorDashboard />} />
            <Route path="markets" element={<Markets />} />
            <Route path="days" element={<MarketDays />} />
            <Route path="days/:id" element={<MarketDayDetail />} />
            <Route path="stalls" element={<OperatorStalls />} />
            <Route path="listings" element={<OperatorListings />} />
            <Route path="settings" element={<OperatorSettings />} />
            <Route path="permissions" element={<Permissions />} />
            <Route path="days/:id/orders" element={<OperatorDayOrders />} />
            <Route path="broadcasts" element={<OperatorBroadcasts />} />
            <Route path="broadcasts/:id" element={<OperatorBroadcastDetail />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ImpersonationProvider>
    </SessionProvider>
  )
}
