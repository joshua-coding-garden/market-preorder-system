import { Navigate, Route, Routes } from 'react-router-dom'
import ImpersonationBar from '@/components/ImpersonationBar'
import { ImpersonationProvider } from '@/store/impersonation'
import { SessionProvider } from '@/store/session'
import CustomerLayout from '@/routes/customer/Layout'
import Login from '@/routes/customer/Login'
import MarketDayList from '@/routes/customer/MarketDayList'
import OperatorLayout from '@/routes/operator/Layout'
import MarketDayDetail from '@/routes/operator/MarketDayDetail'
import MarketDays from '@/routes/operator/MarketDays'
import Markets from '@/routes/operator/Markets'
import Permissions from '@/routes/operator/Permissions'
import OperatorStalls from '@/routes/operator/Stalls'
import Placeholder from '@/routes/Placeholder'
import StallLayout from '@/routes/stall/Layout'
import StallHome from '@/routes/stall/StallHome'
import Redeem from '@/routes/stall/Redeem'
import { RequireCapability } from '@/routes/guard'

/**
 * 三個 view 在同一個 app，用路由前綴分（D-13）：
 *   /          顧客
 *   /stall     攤商
 *   /operator  廠商
 * 尚未進入實作 Sprint 的畫面用 Placeholder 佔位（06-迭代計畫.md）。
 */
export default function App() {
  return (
    <SessionProvider>
      <ImpersonationProvider>
        <ImpersonationBar />
        <Routes>
          {/* 顧客 View */}
          <Route element={<CustomerLayout />}>
            <Route index element={<MarketDayList />} />
            <Route path="login" element={<Login />} />
            <Route path="days/:dayId" element={<Placeholder screen="場次頁" sprint={2} />} />
            <Route
              path="days/:dayId/stalls/:stallId"
              element={<Placeholder screen="攤商頁" sprint={2} />}
            />
            <Route path="days/:dayId/cart" element={<Placeholder screen="購物車" sprint={3} />} />
            <Route
              path="days/:dayId/checkout"
              element={<Placeholder screen="結帳" sprint={3} />}
            />
            <Route path="orders" element={<Placeholder screen="我的訂單" sprint={3} />} />
            <Route path="orders/:id" element={<Placeholder screen="訂單明細" sprint={3} />} />
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
            <Route
              path=":stallId/products"
              element={<Placeholder screen="商品管理" sprint={2} />}
            />
            <Route
              path=":stallId/products/:id"
              element={<Placeholder screen="商品編輯" sprint={2} />}
            />
            <Route
              path=":stallId/days/:dayId/listings"
              element={<Placeholder screen="本場上架" sprint={2} />}
            />
            <Route
              path=":stallId/days/:dayId/orders"
              element={<Placeholder screen="訂單列表" sprint={4} />}
            />
            <Route
              path=":stallId/sub-orders/:id"
              element={<Placeholder screen="訂單詳情" sprint={4} />}
            />
            <Route
              path=":stallId/days/:dayId/prep"
              element={<Placeholder screen="備貨總表" sprint={4} />}
            />
            <Route
              path=":stallId/days/:dayId/pickup"
              element={<Placeholder screen="核銷" sprint={4} />}
            />
            <Route
              path=":stallId/broadcasts"
              element={<Placeholder screen="推播申請" sprint={6} />}
            />
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
            <Route index element={<Placeholder screen="儀表板" sprint={1} />} />
            <Route path="markets" element={<Markets />} />
            <Route path="days" element={<MarketDays />} />
            <Route path="days/:id" element={<MarketDayDetail />} />
            <Route path="stalls" element={<OperatorStalls />} />
            <Route path="permissions" element={<Permissions />} />
            <Route
              path="days/:id/orders"
              element={<Placeholder screen="訂單總覽" sprint={4} />}
            />
            <Route path="broadcasts" element={<Placeholder screen="推播審核" sprint={6} />} />
            <Route
              path="broadcasts/:id"
              element={<Placeholder screen="推播編輯" sprint={6} />}
            />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ImpersonationProvider>
    </SessionProvider>
  )
}
