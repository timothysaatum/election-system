import { useState, useMemo, useEffect, useCallback } from "react";
import {
  Key,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Search,
  Filter,
  X,
  RefreshCw,
} from "lucide-react";
import { api } from "../services/api";

const formatStudentId = (studentId) => {
  if (!studentId) return studentId;
  return studentId.replace(/-/g, '/');
};

// Single source of truth for token status
// Priority: voted → "token_used" | has token → "has_token" | no token → "no_token"
const getTokenStatus = (electorate) => {
  if (electorate.has_voted) return "token_used";
  if (electorate.voting_token) return "has_token";
  return "no_token";
};

const StatusBadge = ({ electorate }) => {
  const status = getTokenStatus(electorate);
  if (status === "token_used") {
    return (
      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
        Token Used
      </span>
    );
  }
  if (status === "has_token") {
    return (
      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
        Token Issued
      </span>
    );
  }
  return (
    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">
      No Token
    </span>
  );
};

export const VoterList = ({
  electorates: electoratesProp,
  loading: loadingProp,
  generatingFor,
  onGenerateToken,
}) => {
  const [electorates, setElectorates] = useState(electoratesProp || []);
  const [fetchLoading, setFetchLoading] = useState(false);
  const loading = loadingProp || fetchLoading;

  const fetchAll = useCallback(async () => {
    if (!api.getActiveElectionId()) return;
    setFetchLoading(true);
    try {
      const all = await api.getAllElectorates();
      setElectorates(all);
    } catch {
      setElectorates(electoratesProp || []);
    } finally {
      setFetchLoading(false);
    }
  }, [electoratesProp]);

  useEffect(() => { fetchAll(); }, [api.getActiveElectionId()]);

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [programFilter, setProgramFilter] = useState("all");

  const programs = useMemo(() => {
    if (!electorates) return [];
    return [...new Set(electorates.map(e => e.program).filter(Boolean))].sort();
  }, [electorates]);

  const filteredData = useMemo(() => {
    if (!electorates || electorates.length === 0) return [];
    return electorates.filter((electorate) => {
      const formattedId = formatStudentId(electorate.student_id);
      const matchesSearch =
        formattedId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        electorate.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        electorate.program?.toLowerCase().includes(searchTerm.toLowerCase());
      if (!matchesSearch) return false;

      // Status filter uses getTokenStatus — same logic everywhere
      if (statusFilter !== "all" && getTokenStatus(electorate) !== statusFilter) return false;

      if (programFilter !== "all" && electorate.program !== programFilter) return false;
      return true;
    });
  }, [electorates, searchTerm, statusFilter, programFilter]);

  const totalItems = filteredData.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);

  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredData.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredData, currentPage, itemsPerPage]);

  const showingFrom = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const showingTo = Math.min(currentPage * itemsPerPage, totalItems);

  const handleSearchChange = (value) => { setSearchTerm(value); setCurrentPage(1); };
  const handleStatusFilterChange = (value) => { setStatusFilter(value); setCurrentPage(1); };
  const handleProgramFilterChange = (value) => { setProgramFilter(value); setCurrentPage(1); };
  const handleItemsPerPageChange = (e) => { setItemsPerPage(parseInt(e.target.value)); setCurrentPage(1); };

  const clearFilters = () => {
    setSearchTerm("");
    setStatusFilter("all");
    setProgramFilter("all");
    setCurrentPage(1);
  };

  const goToFirstPage = () => setCurrentPage(1);
  const goToLastPage = () => setCurrentPage(totalPages);
  const goToNextPage = () => setCurrentPage((prev) => Math.min(prev + 1, totalPages));
  const goToPreviousPage = () => setCurrentPage((prev) => Math.max(prev - 1, 1));
  const goToPage = (page) => setCurrentPage(page);

  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;
    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
      let endPage = Math.min(totalPages, startPage + maxVisible - 1);
      if (endPage - startPage < maxVisible - 1) startPage = Math.max(1, endPage - maxVisible + 1);
      for (let i = startPage; i <= endPage; i++) pages.push(i);
    }
    return pages;
  };

  const hasActiveFilters = searchTerm || statusFilter !== "all" || programFilter !== "all";

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        <p className="mt-4 text-gray-600">Loading voters...</p>
      </div>
    );
  }

  if (!electorates || electorates.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-8 text-center">
        <p className="text-gray-600">No voters found.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Voter List - Generate Tokens</h2>
            <p className="text-sm text-gray-600 mt-1">
              {fetchLoading
                ? <span className="flex items-center gap-1.5"><RefreshCw className="h-3.5 w-3.5 animate-spin inline" /> Loading all voters…</span>
                : <>Total: <strong>{electorates.length}</strong> voters{filteredData.length !== electorates.length && <span className="text-indigo-600 font-semibold"> • Showing: {filteredData.length} filtered</span>}</>
              }
            </p>
          </div>
          <button
            onClick={fetchAll}
            disabled={fetchLoading}
            className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${fetchLoading ? 'animate-spin' : ''}`} />
            {fetchLoading ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by ID, name, or program..."
                value={searchTerm}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
              {searchTerm && (
                <button onClick={() => handleSearchChange("")}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>
          </div>

          {/* Status filter — options match getTokenStatus() values */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => handleStatusFilterChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="all">All Status</option>
              <option value="no_token">No Token</option>
              <option value="has_token">Token Issued</option>
              <option value="token_used">Token Used</option>
            </select>
          </div>

          <div>
            <select
              value={programFilter}
              onChange={(e) => handleProgramFilterChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="all">All Programs</option>
              {programs.map((program) => (
                <option key={program} value={program}>{program}</option>
              ))}
            </select>
          </div>
        </div>

        {hasActiveFilters && (
          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <Filter className="h-4 w-4 text-gray-500" />
              <span className="text-gray-600">Filters active</span>
            </div>
            <button onClick={clearFilters} className="text-sm text-indigo-600 hover:text-indigo-700 font-medium">
              Clear all filters
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        {filteredData.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-600">No voters match your filters.</p>
            <button onClick={clearFilters} className="mt-4 text-indigo-600 hover:text-indigo-700 font-medium">
              Clear filters
            </button>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">#</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Student ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Program</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {paginatedData.map((electorate, index) => {
                const globalIndex = (currentPage - 1) * itemsPerPage + index + 1;
                const status = getTokenStatus(electorate);
                return (
                  <tr key={electorate.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{globalIndex}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {formatStudentId(electorate.student_id)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {electorate.name || "N/A"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {electorate.program || "N/A"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <StatusBadge electorate={electorate} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      {status === "token_used" ? (
                        <span className="text-gray-400 italic">Token Used</span>
                      ) : (
                        <button
                          onClick={() => onGenerateToken(electorate)}
                          disabled={generatingFor === electorate.id}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          <Key className="h-4 w-4" />
                          {generatingFor === electorate.id
                            ? status === "has_token" ? "Regenerating..." : "Generating..."
                            : status === "has_token" ? "Regenerate Token" : "Generate Token"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination Footer */}
      {filteredData.length > 0 && (
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="text-sm text-gray-600">
                Showing <span className="font-semibold text-gray-900">{showingFrom}</span> to{" "}
                <span className="font-semibold text-gray-900">{showingTo}</span> of{" "}
                <span className="font-semibold text-gray-900">{totalItems}</span> voters
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor="itemsPerPage" className="text-sm text-gray-600">Show:</label>
                <select
                  id="itemsPerPage"
                  value={itemsPerPage}
                  onChange={handleItemsPerPageChange}
                  className="border border-gray-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button onClick={goToFirstPage} disabled={currentPage === 1}
                className="p-2 rounded-md border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                <ChevronsLeft className="h-4 w-4 text-gray-600" />
              </button>
              <button onClick={goToPreviousPage} disabled={currentPage === 1}
                className="p-2 rounded-md border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                <ChevronLeft className="h-4 w-4 text-gray-600" />
              </button>
              <div className="hidden sm:flex items-center gap-1">
                {getPageNumbers().map((pageNum) => (
                  <button key={pageNum} onClick={() => goToPage(pageNum)}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${currentPage === pageNum
                      ? "bg-indigo-600 text-white"
                      : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"}`}>
                    {pageNum}
                  </button>
                ))}
              </div>
              <div className="sm:hidden px-3 py-1.5 text-sm text-gray-700">
                Page {currentPage} of {totalPages}
              </div>
              <button onClick={goToNextPage} disabled={currentPage === totalPages}
                className="p-2 rounded-md border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                <ChevronRight className="h-4 w-4 text-gray-600" />
              </button>
              <button onClick={goToLastPage} disabled={currentPage === totalPages}
                className="p-2 rounded-md border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                <ChevronsRight className="h-4 w-4 text-gray-600" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};