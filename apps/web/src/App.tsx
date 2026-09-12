import { Navigate, Route, Routes } from 'react-router-dom'
import { SessionProvider } from '@/store/session'
import CustomerLayout from '@/routes/customer/Layout'
import Login from '@/routes/customer/Login'
import MarketDayList from '@/routes/customer/MarketDayList'
import OperatorLayout from '@/routes/operator/Layout'
import Placeholder from '@/routes/Placeholder'
import StallLayout from '@/routes/stall/Layout'
import { RequireCapability } from '@/routes/guard'

/**
 * 三個 view 在同一個 app，用路由前綴分（D-13）：
 *   /          顧客
 *   /stall     攤商
 *   /operator  廠商
 * Sprint 0 只完成 C1、C9；其餘畫面為佔位，依 06-迭代計畫.md 逐 Sprint 補上。
 */
export default function App() {
  return (
    <SessionProvider>
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
          <Route path="days/:dayId/checkout" element={<Placeholder screen="結帳" sprint={3} />} />
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
          <Route index element={<Placeholder screen="攤商首頁" sprint={1} />} />
          <Route path="redeem" element={<Placeholder screen="輸入邀請碼" sprint={1} />} />
          <Route
            path=":stallId/products"
            element={<Placeholder screen="商品管理" sprint={2} />}
          />
          <Route
            path=":stallId/days/:dayId/orders"
            element={<Placeholder screen="訂單列表" sprint={4} />}
          />
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
          <Route path="markets" element={<Placeholder screen="市集" sprint={1} />} />
          <Route path="days" element={<Placeholder screen="場次列表" sprint={1} />} />
          <Route path="days/:id" element={<Placeholder screen="場次詳情" sprint={1} />} />
          <Route path="stalls" element={<Placeholder screen="攤商管理" sprint={1} />} />
          <Route path="broadcasts" element={<Placeholder screen="推播審核" sprint={6} />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </SessionProvider>
  )
}
