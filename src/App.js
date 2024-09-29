import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import Home from './pages/Home';
import Redeem from './pages/Redeem'; // Add this import
import { WalletProvider } from './context/WalletContext';
import { SidebarProvider } from './context/SidebarContext';
import RedeemAnalytics from './pages/RedeemAnalytics';
import AnalyticsDashboard from './pages/TreasuryAnalytics';

function App() {
  return (
    <SidebarProvider>
      <WalletProvider>
        <Router>
          <div className="App">
            <Navbar />
            <Sidebar />
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/redeem" element={<Redeem />} /> {/* Add this line */}
              <Route path="/dashboard/redemptions" element={<RedeemAnalytics />} /> {/* Add this line */}
              <Route path="/dashboard/treasury" element={<AnalyticsDashboard />} /> {/* Add this line */}
              {/* Add more routes for other pages */}
            </Routes>
          </div>
        </Router>
      </WalletProvider>
    </SidebarProvider>
  );
}

export default App;
