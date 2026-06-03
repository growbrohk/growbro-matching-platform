import { Navigate } from 'react-router-dom';

/** @deprecated Profile editing merged into Brand Page settings */
export default function ProfileSettings() {
  return <Navigate to="/app/settings/brand-page" replace />;
}
