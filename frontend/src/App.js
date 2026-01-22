import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import Admin from "./pages/admin";
import ECOfficial from "./pages/ecOfficial";
import PollingAgent from "./pages/pollingAgent";
import Voting from "./pages/voting";
import LandingPage from "./pages/LandingPage";
import "./App.css";

function App() {
  return (
    <Router>
      <Routes>
        {/* Landing page with portal links */}
        <Route path="/" element={<LandingPage />} />

        {/* Voting page */}
        <Route path="/vote" element={<Voting />} />

        {/* EC Admin Dashboard */}
        <Route path="/admin" element={<Admin />} />

        {/* EC Official Token Generation Portal */}
        <Route path="/official" element={<ECOfficial />} />

        {/* Polling Agent Results Portal */}
        <Route path="/agent" element={<PollingAgent />} />

        {/* Redirect any unknown routes to landing page */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;