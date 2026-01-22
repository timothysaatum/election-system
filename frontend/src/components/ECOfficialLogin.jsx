import { useState } from "react";
import { Key } from "lucide-react";
import { api } from "../services/api";

export const ECOfficialLogin = ({ onLogin, alertModal }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!username || !password) {
      await alertModal.showAlert({
        title: "Validation Error",
        message: "Please enter both username and password",
        type: "error",
      });
      return;
    }

    setLoading(true);

    try {
      const data = await api.login(username, password);

      // FIXED: Allow ec_official AND admin roles
      if (data.role === "ec_official" || data.role === "admin") {
        localStorage.setItem("admin_token", data.access_token);
        onLogin(data);
      } else {
        throw new Error(`Access denied. This portal is for EC Officials only. You are logged in as ${data.role}.`);
      }
    } catch (err) {
      await alertModal.showAlert({
        title: "Login Failed",
        message: err.message,
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter") {
      handleSubmit();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <Key className="h-16 w-16 text-blue-600 mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-gray-900">
            EC Official Portal
          </h1>
          <p className="text-gray-600 mt-2">Token Generation & Management</p>
        </div>

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={handleKeyPress}
              disabled={loading}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
              placeholder="Enter your username"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={loading}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
              placeholder="Enter your password"
            />
          </div>

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium transition-colors"
          >
            {loading ? "Logging in..." : "Login"}
          </button>

          {/* ADDED: Helper text showing valid credentials */}
          <div className="mt-4 p-3 bg-blue-50 rounded-lg">
            <p className="text-xs text-blue-800">
              <strong>Test Credentials:</strong><br />
              EC Official: official123 / SecurePas$123<br />
              Admin: admin123 / SecurePass!123
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};