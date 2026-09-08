import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { StudioAccess } from './components/account/StudioAccess'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StudioAccess />
  </StrictMode>,
)
