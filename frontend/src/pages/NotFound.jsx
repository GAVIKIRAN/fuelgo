import { Link } from 'react-router-dom'
import { EmptyState } from '../components/ui'
import { homePathFor, useAuth } from '../context/AuthContext'

export default function NotFound() {
  const { user } = useAuth()
  return (
    <div style={{ padding: 40 }}>
      <EmptyState icon="pin" title="Page not found" text="This page doesn't exist or has moved."
        action={<Link to={user ? homePathFor(user) : '/'} className="btn btn-primary">Go home</Link>} />
    </div>
  )
}
