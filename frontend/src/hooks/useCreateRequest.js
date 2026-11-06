import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { requestApi } from '../api'
import { errorMessage } from '../api/client'
import { clearDraft, takePendingPhoto } from '../utils/draft'

/** Book a request from a draft; handles photo upload and the common error cases. */
export function useCreateRequest() {
  const navigate = useNavigate()
  const [submitting, setSubmitting] = useState(false)

  const submit = async (draft, { providerId = null, autoAssign = false } = {}) => {
    setSubmitting(true)
    try {
      const payload = { ...draft.payload, provider_id: providerId, auto_assign: autoAssign }
      const req = await requestApi.create(payload)
      const photo = takePendingPhoto()
      if (photo) {
        try {
          await requestApi.uploadPhoto(req.id, photo)
        } catch {
          toast.error('Request booked, but the photo could not be uploaded.')
        }
      }
      clearDraft()
      toast.success(`Request sent to ${req.provider.business_name}`)
      navigate(`/app/requests/${req.id}`, { replace: true })
      return req
    } catch (err) {
      const e = err.response?.data?.error
      if (err.response?.status === 409 && e?.details?.active_request_id) {
        toast.error('You already have an active request.')
        navigate(`/app/requests/${e.details.active_request_id}`)
      } else {
        toast.error(errorMessage(err))
      }
      return null
    } finally {
      setSubmitting(false)
    }
  }

  return { submit, submitting }
}
