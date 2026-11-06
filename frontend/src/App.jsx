import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import { Loading } from './components/ui'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Register from './pages/Register'
import NotFound from './pages/NotFound'

// user
const UserHome = lazy(() => import('./pages/user/UserHome'))
const NewFuelRequest = lazy(() => import('./pages/user/NewFuelRequest'))
const NewMechanicRequest = lazy(() => import('./pages/user/NewMechanicRequest'))
const ProviderSelection = lazy(() => import('./pages/user/ProviderSelection'))
const LiveTracking = lazy(() => import('./pages/user/LiveTracking'))
const Payment = lazy(() => import('./pages/user/Payment'))
const ServiceHistory = lazy(() => import('./pages/user/ServiceHistory'))
const RateService = lazy(() => import('./pages/user/RateService'))
const Profile = lazy(() => import('./pages/user/Profile'))
// provider
const ProviderDashboard = lazy(() => import('./pages/provider/ProviderDashboard'))
const IncomingRequests = lazy(() => import('./pages/provider/IncomingRequests'))
const ActiveJob = lazy(() => import('./pages/provider/ActiveJob'))
const Earnings = lazy(() => import('./pages/provider/Earnings'))
const ProviderProfile = lazy(() => import('./pages/provider/ProviderProfile'))
// admin
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'))
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers'))
const AdminProviders = lazy(() => import('./pages/admin/AdminProviders'))
const AdminRequests = lazy(() => import('./pages/admin/AdminRequests'))
const AdminPayments = lazy(() => import('./pages/admin/AdminPayments'))
const AdminFeedback = lazy(() => import('./pages/admin/AdminFeedback'))
const AdminPricing = lazy(() => import('./pages/admin/AdminPricing'))
const AdminML = lazy(() => import('./pages/admin/AdminML'))

export default function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        <Route element={<ProtectedRoute roles={['user']} />}>
          <Route path="/app" element={<Layout />}>
            <Route index element={<UserHome />} />
            <Route path="fuel" element={<NewFuelRequest />} />
            <Route path="mechanic" element={<NewMechanicRequest />} />
            <Route path="select-provider" element={<ProviderSelection />} />
            <Route path="requests/:id" element={<LiveTracking />} />
            <Route path="requests/:id/pay" element={<Payment />} />
            <Route path="requests/:id/rate" element={<RateService />} />
            <Route path="history" element={<ServiceHistory />} />
            <Route path="profile" element={<Profile />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute roles={['provider']} />}>
          <Route path="/provider" element={<Layout />}>
            <Route index element={<ProviderDashboard />} />
            <Route path="requests" element={<IncomingRequests />} />
            <Route path="job" element={<ActiveJob />} />
            <Route path="earnings" element={<Earnings />} />
            <Route path="profile" element={<ProviderProfile />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute roles={['admin']} />}>
          <Route path="/admin" element={<Layout />}>
            <Route index element={<AdminDashboard />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="providers" element={<AdminProviders />} />
            <Route path="requests" element={<AdminRequests />} />
            <Route path="payments" element={<AdminPayments />} />
            <Route path="feedback" element={<AdminFeedback />} />
            <Route path="pricing" element={<AdminPricing />} />
            <Route path="ml" element={<AdminML />} />
          </Route>
        </Route>

        <Route path="/home" element={<Navigate to="/" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  )
}
