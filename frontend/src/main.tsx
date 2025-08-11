import React from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import App from './App'
import PositionDetail from './position-detail'
import './styles.css'

const router = createBrowserRouter([
  { path: '/', element: <App /> },
  { path: '/positions/:id', element: <PositionDetail /> },
])

const root = createRoot(document.getElementById('root')!)
root.render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
)
