import React, { useState, useEffect, useCallback } from 'react';
import { 
  Calendar, 
  Clock, 
  DoorOpen, 
  Search, 
  CheckCircle2, 
  XCircle, 
  Hotel,
  ArrowRight,
  User,
  Info,
  Printer,
  List,
  Filter,
  History,
  CalendarDays,
  Settings,
  Plus,
  Coffee,
  Package as PackageIcon,
  Bed,
  Users,
  Share2,
  Download,
  FileText,
  CreditCard,
  Trash2,
  Phone,
  Mail,
  MapPin,
  X,
  ShieldCheck,
  ExternalLink,
  Sparkles,
  RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, Type } from "@google/genai";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';
import * as XLSX from 'xlsx';

const getBase64ImageFromURL = (url: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.setAttribute('crossOrigin', 'anonymous');
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0);
      const dataURL = canvas.toDataURL('image/png');
      resolve(dataURL);
    };
    img.onerror = error => reject(error);
    img.src = url;
  });
};

const formatDateDDMMYYYY = (dateStr: string | Date) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
};

interface Room {
  id: number;
  room_number: string;
  type: string;
  price: number;
  plan: string;
  description: string;
  ac_type?: string;
  image_url?: string;
  is_available?: boolean;
}

interface Booking {
  id: number;
  booking_id: string;
  room_id: number;
  check_in: string;
  check_out: string;
  check_in_time: string;
  check_out_time: string;
  departure_time: string;
  guest_name: string;
  guest_email: string;
  guest_phone: string;
  plan: string;
  status: 'confirmed' | 'cancelled';
  adults: number;
  children: number;
  room_number: string;
  room_type: string;
  room_price: number;
  dsda_charge: number;
  advance_payment: number;
  guest_gst?: string;
  guest_address?: string;
  is_billed?: boolean;
}

interface Bill {
  id: number;
  invoice_id: string;
  booking_id?: string;
  guest_name: string;
  guest_phone: string;
  guest_email: string;
  guest_address: string;
  guest_gst: string;
  check_in: string;
  check_out: string;
  rooms_data: string; // JSON string of rooms
  base_price: number;
  gst_amount: number;
  dsda_charge: number;
  total_amount: number;
  bill_type: 'GST' | 'Normal';
  created_at: string;
}

interface AvailabilityResult {
  available: boolean;
  rooms: Room[];
}

export default function App() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [dbError, setDbError] = useState<string | null>(null);
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [roomNumber, setRoomNumber] = useState('');
  const [departureTime, setDepartureTime] = useState('09:30');
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestGST, setGuestGST] = useState('');
  const [guestAddress, setGuestAddress] = useState('');
  const [dsdaCharge, setDsdaCharge] = useState('0');
  const [advancePayment, setAdvancePayment] = useState('0');
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [roomAcTypes, setRoomAcTypes] = useState<Record<number, 'AC' | 'Non-AC'>>({});
  const [result, setResult] = useState<AvailabilityResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [lastBookedRooms, setLastBookedRooms] = useState<Room[]>([]);
  const [lastBookingDetails, setLastBookingDetails] = useState<{
    guestName: string;
    guestEmail: string;
    guestPhone: string;
    checkIn: string;
    checkOut: string;
    departureTime: string;
    selectedPlan: string;
    adults: number;
    children: number;
    dsdaCharge: number;
    advancePayment: number;
    bookingId: string;
    bookedPrices: Record<number, number>;
  } | null>(null);
  const [activeView, setActiveView] = useState<'availability' | 'bookings' | 'profiles' | 'settings' | 'inventory' | 'billing' | 'all_bills'>('availability');
  const [allBookings, setAllBookings] = useState<Booking[]>([]);
  const [allBills, setAllBills] = useState<Bill[]>([]);
  const [guests, setGuests] = useState<{ guest_name: string; booking_count: number; last_stay: string; guest_phone: string; guest_email: string }[]>([]);
  const [selectedGuest, setSelectedGuest] = useState<string | null>(null);
  const [guestBookings, setGuestBookings] = useState<Booking[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'upcoming' | 'past'>('all');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'confirmed' | 'cancelled'>('all');
  const [selectedRoomIds, setSelectedRoomIds] = useState<number[]>([]);
  const [customPrices, setCustomPrices] = useState<Record<number, number>>({});
  const [selectedBillMonth, setSelectedBillMonth] = useState<string>(new Date().toISOString().slice(0, 7));
  const [showManualBill, setShowManualBill] = useState(false);
  const [manualBillData, setManualBillData] = useState({
    guest_name: '',
    guest_phone: '',
    guest_email: '',
    guest_address: '',
    guest_gst: '',
    rooms: [{ room_number: '', room_type: '', room_price: 0 }],
    check_in: new Date().toISOString().split('T')[0],
    check_out: new Date(Date.now() + 86400000).toISOString().split('T')[0],
    dsda_charge: 0,
    include_dsda: true
  });
  const [fetchingGST, setFetchingGST] = useState(false);
  const [fetchingAI, setFetchingAI] = useState(false);
  const [usingMockGST, setUsingMockGST] = useState(false);
  const [gstConfig, setGstConfig] = useState<{configured: boolean, providers: any} | null>(null);
  const [includeDsdaMap, setIncludeDsdaMap] = useState<Record<string, boolean>>({});
  const [isRetrieving, setIsRetrieving] = useState(false);

  const retrieveDeletedBookings = async () => {
    setIsRetrieving(true);
    try {
      const res = await fetch('/api/bookings/retrieve', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        alert(`${data.count} bookings retrieved successfully!`);
        fetchBookings();
        fetchGuests();
      } else {
        alert(data.error || "Failed to retrieve bookings");
      }
    } catch (error) {
      console.error("Error retrieving bookings:", error);
      alert("An error occurred while retrieving bookings");
    } finally {
      setIsRetrieving(false);
    }
  };

  useEffect(() => {
    const checkGstStatus = async () => {
      try {
        const res = await fetch('/api/gst-status');
        const data = await res.json();
        setGstConfig(data);
      } catch (error) {
        console.error("Error checking GST status", error);
      }
    };
    const checkHealth = async () => {
      try {
        const res = await fetch('/api/health');
        const data = await res.json();
        setIsNetlify(!!data.isNetlify);
        setIsConnected(data.status === 'ok');
      } catch (error) {
        console.error("Error checking health", error);
        setIsConnected(false);
      }
    };
    checkGstStatus();
    checkHealth();
  }, []);

  const fetchGSTDetails = async (gstin: string, target: 'booking' | 'manual' = 'manual') => {
    if (gstin.length !== 15) return;
    
    // Check cache first for "FAST fetch"
    const cacheKey = `gst_cache_${gstin}`;
    const cachedData = localStorage.getItem(cacheKey);
    if (cachedData) {
      try {
        const data = JSON.parse(cachedData);
        if (target === 'booking') {
          setGuestName(data.name);
          setGuestAddress(data.address);
        } else {
          setManualBillData(prev => ({
            ...prev,
            guest_name: data.name,
            guest_address: data.address
          }));
        }
        return; // Instant return from cache
      } catch (e) {
        localStorage.removeItem(cacheKey);
      }
    }

    setFetchingGST(true);
    setUsingMockGST(false);
    setFetchingAI(false);
    
    try {
      const res = await fetch(`/api/gst-verify/${gstin}`);
      const data = await res.json();

      if (res.ok && data.success) {
        // Cache the successful result
        localStorage.setItem(cacheKey, JSON.stringify({ name: data.name, address: data.address }));
        
        if (target === 'booking') {
          setGuestName(data.name);
          setGuestAddress(data.address);
        } else {
          setManualBillData(prev => ({
            ...prev,
            guest_name: data.name,
            guest_address: data.address
          }));
        }
      } else {
        // If backend returns error or success: false (like 404, 500, or inactive status), try AI Lookup
        console.log("Backend GST fetch failed or inactive, trying AI fallback...");
        await fetchGSTWithAI(gstin, target);
      }
    } catch (error) {
      console.error("GST Fetch error", error);
      setUsingMockGST(true);
      // Fallback to mock if AI also fails or other errors
      applyMockGSTData(gstin, target);
    } finally {
      setFetchingGST(false);
    }
  };

  const fetchGSTWithAI = async (gstin: string, target: 'booking' | 'manual') => {
    setFetchingAI(true);
    try {
      const ai = new GoogleGenAI({ apiKey: (process.env as any).GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Find the legal business name and the principal place of business (full address) for the Indian GST number: ${gstin}. Search the web if needed.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              address: { type: Type.STRING }
            },
            required: ["name", "address"]
          },
          tools: [{ googleSearch: {} }]
        }
      });

      const result = JSON.parse(response.text);
      if (result.name && result.address) {
        // Cache the AI result too
        localStorage.setItem(`gst_cache_${gstin}`, JSON.stringify({ name: result.name, address: result.address }));
        
        if (target === 'booking') {
          setGuestName(result.name);
          setGuestAddress(result.address);
        } else {
          setManualBillData(prev => ({
            ...prev,
            guest_name: result.name,
            guest_address: result.address
          }));
        }
      } else {
        throw new Error("AI could not find details");
      }
    } catch (error) {
      console.error("AI GST Fetch error", error);
      applyMockGSTData(gstin, target);
      setUsingMockGST(true);
    } finally {
      setFetchingAI(false);
    }
  };

  const applyMockGSTData = (gstin: string, target: 'booking' | 'manual') => {
    const stateCode = gstin.substring(0, 2);
    const mockCompanies = [
      "Global Tech Solutions Pvt Ltd",
      "Apex Retail Enterprises",
      "Sunrise Hospitality Group",
      "Blue Ocean Logistics",
      "Emerald Manufacturing Corp",
      "Golden Peacock Trading Co.",
      "Silver Line Textiles",
      "Modern Infrastructure Ltd"
    ];
    const mockAddresses = [
      "123 Business Park, Sector 45, Industrial Area",
      "Suite 501, Regency Tower, MG Road",
      "Plot No. 88, Green Valley Estate, Phase II",
      "4th Floor, Landmark Building, Commercial Hub",
      "Building 7, Innovation Campus, Tech Park",
      "Shop 12, Central Market, Mall Road",
      "Industrial Estate, Plot 44, NH-8",
      "Business Center, Level 2, Airport Road"
    ];
    const index = parseInt(gstin.charAt(12), 36) % mockCompanies.length;
    const mockData = {
      name: `[DEMO] ${mockCompanies[index]}`,
      address: `${mockAddresses[index]}, State Code: ${stateCode} (Derived from GSTIN)`
    };

    if (target === 'booking') {
      setGuestName(mockData.name);
      setGuestAddress(mockData.address);
    } else {
      setManualBillData(prev => ({
        ...prev,
        guest_name: mockData.name,
        guest_address: mockData.address
      }));
    }
  };
  const [showReview, setShowReview] = useState(false);
  const [dailyBookingsDate, setDailyBookingsDate] = useState(new Date().toISOString().split('T')[0]);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [isNetlify, setIsNetlify] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  
  // Settings State
  const [hotelSettings, setHotelSettings] = useState({
    hotel_name: 'LuxeStay',
    hotel_address: '',
    contact_info: '',
    logo_url: '',
    dsda_charge: '0',
    additional_charge_name: 'DSDA Charge',
    theme: 'emerald',
    gst_number: '',
    signature_url: '',
    state_code: '19' // Default to West Bengal or similar
  });
  const [updatingSettings, setUpdatingSettings] = useState(false);
  
  const [newRoom, setNewRoom] = useState({
    room_number: '',
    type: 'Double Bed Room',
    price: '',
    plan: 'Only Room',
    description: ''
  });
  const [addingRoom, setAddingRoom] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);
  const [editGuestName, setEditGuestName] = useState('');
  const [editGuestEmail, setEditGuestEmail] = useState('');
  const [editGuestPhone, setEditGuestPhone] = useState('');
  const [updatingBooking, setUpdatingBooking] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState('Only Room');

  const calculateNights = (start: string, end: string) => {
    if (!start || !end) return 0;
    const diff = new Date(end).getTime() - new Date(start).getTime();
    return Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  };

  const performCheckAvailability = useCallback(async () => {
    if (!checkIn || !checkOut) return;
    
    setLoading(true);
    try {
      const params = new URLSearchParams({
        room_number: roomNumber,
        check_in: checkIn,
        check_out: checkOut
      });
      const res = await fetch(`/api/availability?${params}`);
      const data = await res.json();
      setResult(data);
      if (data.available && data.rooms.length > 0) {
        setSelectedPlan(data.rooms[0].plan || 'Only Room');
        const availableIds = data.rooms.map((r: Room) => r.id);
        setSelectedRoomIds(prev => prev.filter(id => availableIds.includes(id)));
      } else {
        setSelectedRoomIds([]);
      }
    } catch (error) {
      console.error("Error checking availability:", error);
    } finally {
      setLoading(false);
    }
  }, [checkIn, checkOut, roomNumber]);

  const fetchRooms = async () => {
    try {
      const res = await fetch('/api/rooms');
      const data = await res.json();
      if (data.error) {
        setDbError(data.error);
        return;
      }
      setRooms(Array.isArray(data) ? data : []);
      setDbError(null);
    } catch (error) {
      console.error("Error fetching rooms:", error);
    }
  };

  const fetchBills = async () => {
    try {
      const res = await fetch('/api/bills');
      const data = await res.json();
      if (data.error) {
        console.error("Server error fetching bills:", data.error);
        return;
      }
      setAllBills(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Network or parsing error fetching bills:", error);
    }
  };

  const saveBillToDb = async (booking: Booking, billType: 'GST' | 'Normal', totalAmount: number, basePrice: number, gstAmount: number, dsdaCharge: number, groupBookings: Booking[]) => {
    try {
      const billData = {
        invoice_id: getInvoiceId(booking),
        booking_id: booking.booking_id,
        guest_name: booking.guest_name,
        guest_phone: booking.guest_phone,
        guest_email: booking.guest_email,
        guest_address: (booking as any).guest_address || '',
        guest_gst: (booking as any).guest_gst || '',
        check_in: booking.check_in,
        check_out: booking.check_out,
        rooms_data: JSON.stringify(groupBookings.map(b => ({
          room_number: b.room_number,
          room_type: b.room_type,
          room_price: b.room_price
        }))),
        base_price: basePrice,
        gst_amount: gstAmount,
        dsda_charge: dsdaCharge,
        total_amount: totalAmount,
        bill_type: billType
      };

      await fetch('/api/bills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(billData)
      });
      fetchBills();
      fetchBookings();
    } catch (error) {
      console.error("Error saving bill to DB:", error);
    }
  };

  const downloadBillFromHistory = async (bill: Bill) => {
    const rooms = JSON.parse(bill.rooms_data || '[]');
    const fakeBooking: any = {
      booking_id: bill.booking_id || bill.invoice_id,
      guest_name: bill.guest_name,
      guest_phone: bill.guest_phone,
      guest_email: bill.guest_email,
      guest_address: bill.guest_address,
      guest_gst: bill.guest_gst,
      check_in: bill.check_in,
      check_out: bill.check_out,
      dsda_charge: bill.dsda_charge,
      room_price: rooms[0]?.room_price || 0,
      room_number: rooms[0]?.room_number || '',
      room_type: rooms[0]?.room_type || '',
      advance_payment: 0
    };

    const fakeGroupBookings: any[] = rooms.map((r: any, idx: number) => ({
      ...fakeBooking,
      id: Date.now() + idx,
      room_number: r.room_number,
      room_type: r.room_type,
      room_price: r.room_price
    }));

    if (bill.bill_type === 'GST') {
      await generateGSTBillPDF(fakeBooking, true, fakeGroupBookings, true);
    } else {
      await downloadReceiptForBooking(fakeBooking, true, fakeGroupBookings, true);
    }
  };

  const deleteBill = async (id: number) => {
    if (!confirm("Are you sure you want to delete this bill?")) return;
    try {
      await fetch(`/api/bills/${id}`, { method: 'DELETE' });
      fetchBills();
    } catch (error) {
      console.error("Error deleting bill:", error);
    }
  };

  const clearAllBills = async () => {
    if (!confirm("Are you sure you want to clear all bill history? This cannot be undone.")) return;
    try {
      await fetch('/api/bills', { method: 'DELETE' });
      fetchBills();
    } catch (error) {
      console.error("Error clearing bills:", error);
    }
  };

  useEffect(() => {
    fetchRooms();
    fetchBookings();
    fetchBills();
    fetchGuests();
    fetchSettings();

    // WebSocket connection
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}`);
    
    socket.onopen = () => setIsLive(true);
    socket.onclose = () => setIsLive(false);
    
    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'BOOKING_UPDATED') {
        fetchBookings();
        fetchGuests();
        performCheckAvailability();
      } else if (data.type === 'BILLS_UPDATED') {
        fetchBills();
      } else if (data.type === 'ROOMS_UPDATED') {
        fetchRooms();
        performCheckAvailability();
      } else if (data.type === 'SETTINGS_UPDATED') {
        fetchSettings();
      }
    };

    setWs(socket);
    return () => socket.close();
  }, [performCheckAvailability]);

  // Polling for Netlify (since WebSockets aren't supported)
  useEffect(() => {
    if (isNetlify && !isLive) {
      const interval = setInterval(() => {
        fetchBookings();
        fetchGuests();
        fetchRooms();
        fetchSettings();
      }, 30000); // Poll every 30 seconds
      return () => clearInterval(interval);
    }
  }, [isNetlify, isLive]);

  // Auto-check availability on input change
  useEffect(() => {
    const timer = setTimeout(() => {
      performCheckAvailability();
    }, 500); // Debounce
    return () => clearTimeout(timer);
  }, [performCheckAvailability]);

  const fetchGuests = async () => {
    try {
      const res = await fetch('/api/guests');
      const data = await res.json();
      if (data.error) {
        setDbError(data.error);
        return;
      }
      setGuests(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error fetching guests:", error);
    }
  };

  useEffect(() => {
    if (hotelSettings.theme) {
      document.documentElement.setAttribute('data-theme', hotelSettings.theme);
    }
  }, [hotelSettings.theme]);

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (data.error) {
        setDbError(data.error);
        return;
      }
      setHotelSettings(prev => ({ ...prev, ...(data || {}) }));
    } catch (error) {
      console.error("Error fetching settings:", error);
    }
  };

  const fetchGuestBookings = async (name: string) => {
    try {
      const res = await fetch(`/api/guests/${encodeURIComponent(name)}/bookings`);
      const data = await res.json();
      setGuestBookings(data);
    } catch (error) {
      console.error("Error fetching guest bookings:", error);
    }
  };

  const fetchBookings = async () => {
    try {
      const res = await fetch('/api/bookings');
      const data = await res.json();
      if (data.error) {
        setDbError(data.error);
        if (data.error.startsWith('{')) {
          throw new Error(data.error);
        }
        return;
      }
      setAllBookings(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error fetching bookings:", error);
      if (error instanceof Error && error.message.startsWith('{')) {
        throw error;
      }
    }
  };

  const checkAvailability = async (e: React.FormEvent) => {
    e.preventDefault();
    performCheckAvailability();
  };

  const handleBooking = async () => {
    if (selectedRoomIds.length === 0 || !guestName) return;

    setLoading(true);
    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_ids: selectedRoomIds,
          room_ac_types: roomAcTypes,
          check_in: checkIn,
          check_out: checkOut,
          departure_time: departureTime,
          guest_name: guestName,
          guest_email: guestEmail,
          guest_phone: guestPhone,
          plan: selectedPlan,
          adults,
          children,
          custom_prices: customPrices,
          dsda_charge: parseFloat(dsdaCharge) || 0,
          advance_payment: parseFloat(advancePayment) || 0,
          guest_gst: guestGST,
          guest_address: guestAddress
        })
      });
      const data = await res.json();
      if (data.error) {
        if (data.error.startsWith('{')) {
          throw new Error(data.error);
        }
        alert(data.error);
        return;
      }
      if (data.success) {
        const bookedRooms = rooms.filter(r => selectedRoomIds.includes(r.id));
        setLastBookedRooms(bookedRooms);
        const bookingId = `LS-${Math.floor(Math.random() * 90000) + 10000}`;
        setLastBookingDetails({
          guestName,
          guestEmail,
          guestPhone,
          checkIn,
          checkOut,
          departureTime,
          selectedPlan,
          adults,
          children,
          dsdaCharge: parseFloat(dsdaCharge) || 0,
          advancePayment: parseFloat(advancePayment) || 0,
          bookingId,
          bookedPrices: { ...customPrices }
        });
        setBookingSuccess(true);
        setResult(null);
        setShowReview(false);
        setSelectedRoomIds([]);
        fetchBookings();
        fetchGuests();
        // Reset form
        setGuestName('');
        setGuestEmail('');
        setGuestPhone('');
        setGuestGST('');
        setGuestAddress('');
        setDsdaCharge('0');
        setAdvancePayment('0');
        setAdults(1);
        setChildren(0);
      }
    } catch (error) {
      console.error("Error booking room:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelBooking = async (id: number) => {
    if (!confirm('Are you sure you want to cancel this room from the booking?')) return;
    
    try {
      const res = await fetch(`/api/bookings/${id}/cancel`, {
        method: 'PATCH'
      });
      const data = await res.json();
      if (data.success) {
        fetchBookings();
      } else {
        alert(data.error || "Failed to cancel room");
      }
    } catch (error) {
      console.error("Error cancelling room:", error);
      alert("An error occurred while cancelling the room");
    }
  };

  const handleCancelGroupBooking = async (bookingId: string) => {
    if (!bookingId) {
      alert("This booking doesn't have a group ID. Please cancel rooms individually.");
      return;
    }
    if (!confirm('Are you sure you want to cancel the ENTIRE booking (all rooms)?')) return;
    
    try {
      const res = await fetch(`/api/bookings/group/${bookingId}/cancel`, {
        method: 'PATCH'
      });
      const data = await res.json();
      if (data.success) {
        fetchBookings();
      } else {
        alert(data.error || "Failed to cancel group booking");
      }
    } catch (error) {
      console.error("Error cancelling entire booking:", error);
    }
  };

  const handleEditBooking = (booking: Booking) => {
    setEditingBooking(booking);
    setEditGuestName(booking.guest_name);
    setEditGuestEmail(booking.guest_email);
    setEditGuestPhone(booking.guest_phone);
  };

  const handleUpdateBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBooking) return;
    setUpdatingBooking(true);
    try {
      const res = await fetch(`/api/bookings/group/${editingBooking.booking_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guest_name: editGuestName,
          guest_email: editGuestEmail,
          guest_phone: editGuestPhone
        })
      });
      const data = await res.json();
      if (data.success) {
        setEditingBooking(null);
        fetchBookings();
      }
    } catch (error) {
      console.error("Error updating booking:", error);
    } finally {
      setUpdatingBooking(false);
    }
  };

  const resetFilters = () => {
    setSearchQuery('');
    setFilterType('all');
    setFilterStatus('all');
    setFilterStartDate('');
    setFilterEndDate('');
  };

  const handleUpdateSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdatingSettings(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(hotelSettings)
      });
      const data = await res.json();
      if (data.success) {
        alert('Settings updated successfully!');
      } else {
        alert(data.error || 'Failed to update settings');
      }
    } catch (error) {
      console.error("Error updating settings:", error);
    } finally {
      setUpdatingSettings(false);
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setHotelSettings(prev => ({ ...prev, logo_url: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSignatureUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setHotelSettings(prev => ({ ...prev, signature_url: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUpdateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRoom) return;
    setAddingRoom(true);
    try {
      const res = await fetch(`/api/rooms/${editingRoom.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...editingRoom,
          price: parseFloat(String(editingRoom.price)),
          ac_type: editingRoom.ac_type || 'Non-AC',
          image_url: editingRoom.image_url || ''
        })
      });
      const data = await res.json();
      if (data.success) {
        setEditingRoom(null);
        const roomsRes = await fetch('/api/rooms');
        const roomsData = await roomsRes.json();
        setRooms(roomsData);
      }
    } catch (error) {
      console.error("Error updating room:", error);
    } finally {
      setAddingRoom(false);
    }
  };

  const handleDeleteRoom = async (id: number) => {
    if (!confirm('Are you sure you want to delete this room?')) return;
    try {
      const res = await fetch(`/api/rooms/${id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        fetchRooms();
      } else {
        alert(data.error);
      }
    } catch (error) {
      console.error("Error deleting room:", error);
    }
  };

  const handleAddRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoom.room_number || !newRoom.price) {
      alert('Please fill in room number and price');
      return;
    }
    setAddingRoom(true);
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newRoom,
          price: parseFloat(newRoom.price),
          ac_type: 'Non-AC',
          image_url: ''
        })
      });
      const data = await res.json();
      if (data.success) {
        const roomsRes = await fetch('/api/rooms');
        const roomsData = await roomsRes.json();
        setRooms(roomsData);
        setNewRoom({
          room_number: '',
          type: 'Double Bed Room',
          price: '',
          plan: 'Only Room',
          description: ''
        });
        alert('Room added successfully!');
      } else {
        alert(data.error || 'Failed to add room');
      }
    } catch (error) {
      console.error("Error adding room:", error);
      alert('Network error. Please try again.');
    } finally {
      setAddingRoom(false);
    }
  };

  const generatePDFReceipt = async () => {
    if (!lastBookingDetails) return;
    const doc = new jsPDF();
    const dsdaCharge = lastBookingDetails.dsdaCharge || 0;
    const advancePayment = lastBookingDetails.advancePayment || 0;
    const nights = calculateNights(lastBookingDetails.checkIn, lastBookingDetails.checkOut);
    
    const themeColors: Record<string, string> = {
      emerald: '#059669',
      indigo: '#4f46e5',
      rose: '#e11d48',
      amber: '#d97706',
      slate: '#475569'
    };
    const primaryColor = themeColors[hotelSettings.theme] || '#059669';

    // Header
    doc.setFillColor(primaryColor);
    doc.rect(0, 0, 210, 40, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text(hotelSettings.hotel_name, 20, 20);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(hotelSettings.hotel_address, 20, 28);
    doc.text(hotelSettings.contact_info, 20, 33);

    if (hotelSettings.logo_url) {
      try {
        const logoBase64 = await getBase64ImageFromURL(hotelSettings.logo_url);
        doc.addImage(logoBase64, 'PNG', 170, 5, 25, 25);
      } catch (e) {
        console.error("Error adding logo to PDF", e);
      }
    }

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('BOOKING CONFIRMATION', 150, 35);

    // Booking ID & Date
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Booking ID:', 20, 55);
    doc.setFont('helvetica', 'normal');
    doc.text(lastBookingDetails.bookingId, 50, 55);
    
    doc.setFont('helvetica', 'bold');
    doc.text('Date:', 140, 55);
    doc.setFont('helvetica', 'normal');
    doc.text(formatDateDDMMYYYY(new Date()), 160, 55);

    // Guest Details
    doc.setDrawColor(200, 200, 200);
    doc.line(20, 65, 190, 65);
    
    doc.setFont('helvetica', 'bold');
    doc.text('GUEST DETAILS', 20, 75);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Name: ${lastBookingDetails.guestName}`, 20, 85);
    doc.text(`Email: ${lastBookingDetails.guestEmail}`, 20, 92);
    doc.text(`Phone: ${lastBookingDetails.guestPhone}`, 20, 99);
    doc.text(`Occupancy: ${lastBookingDetails.adults} Adults, ${lastBookingDetails.children} Children`, 120, 85);

    // Stay Details
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('STAY DETAILS', 20, 115);
    
    autoTable(doc, {
      startY: 120,
      head: [['Check-in', 'Check-out', 'Plan']],
      body: [[
        `${formatDateDDMMYYYY(lastBookingDetails.checkIn)} (10:30 AM)`,
        `${formatDateDDMMYYYY(lastBookingDetails.checkOut)} (09:30 AM)`,
        lastBookingDetails.selectedPlan
      ]],
      headStyles: { fillColor: primaryColor }
    });

    // Room Details
    const roomRows = lastBookedRooms.map(r => {
      const price = lastBookingDetails.bookedPrices[r.id] || r.price;
      return [
        r.type,
        nights.toString(),
        `Rs. ${price}`,
        `Rs. ${price * nights}`
      ];
    });

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 15,
      head: [['Type', 'Days', 'Price', 'Total']],
      body: roomRows,
      headStyles: { fillColor: primaryColor }
    });

    // Summary
    const finalY = (doc as any).lastAutoTable.finalY + 15;
    const subtotal = lastBookedRooms.reduce((acc, curr) => acc + ((lastBookingDetails.bookedPrices[curr.id] || curr.price) * nights), 0);
    const total = subtotal + dsdaCharge;
    const balance = total - advancePayment;

    doc.setFontSize(10);
    doc.text('Subtotal:', 140, finalY);
    doc.text(`Rs. ${subtotal.toFixed(2)}`, 175, finalY);
    
    if (dsdaCharge > 0) {
      doc.text(`${hotelSettings.additional_charge_name || 'Additional Charge'}:`, 140, finalY + 7);
      doc.text(`Rs. ${dsdaCharge.toFixed(2)}`, 175, finalY + 7);
    }

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(primaryColor);
    doc.text('Total Amount:', 140, finalY + 18);
    doc.text(`Rs. ${total.toFixed(2)}`, 175, finalY + 18);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    doc.text('Advance Paid:', 140, finalY + 28);
    doc.text(`Rs. ${advancePayment.toFixed(2)}`, 175, finalY + 28);

    doc.setFont('helvetica', 'bold');
    doc.text('Balance Due:', 140, finalY + 35);
    doc.text(`Rs. ${balance.toFixed(2)}`, 175, finalY + 35);

    // Footer
    doc.setFontSize(10);
    doc.setTextColor(150, 150, 150);
    doc.setFont('helvetica', 'italic');
    doc.text(`Thank you for choosing ${hotelSettings.hotel_name}!`, 105, 275, { align: 'center' });

    doc.setFontSize(8);
    doc.text('This is a computer generated invoice. Signature not required.', 105, 282, { align: 'center' });
    doc.text('Default Check-out time is 09:30 AM.', 105, 287, { align: 'center' });

    doc.save(`Receipt-${lastBookingDetails.bookingId}.pdf`);
  };

  const getInvoiceId = (booking: Booking) => {
    const date = new Date(booking.check_in);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    let finYear = "";
    if (month >= 4) {
      finYear = `${year.toString().slice(-2)}-${(year + 1).toString().slice(-2)}`;
    } else {
      finYear = `${(year - 1).toString().slice(-2)}-${year.toString().slice(-2)}`;
    }
    
    // For serial number, use the booking's ID numeric part
    const numericId = (booking.id || 0).toString().padStart(3, '0');
    return `GP/${finYear}/${numericId}`;
  };

  const downloadReceiptForBooking = async (booking: Booking, includeAdditionalCharges: boolean = true, customGroupBookings?: Booking[], skipSave: boolean = false) => {
    let groupBookings = customGroupBookings || allBookings.filter(b => b.booking_id === booking.booking_id);
    if (groupBookings.length === 0) {
      groupBookings = [booking];
    }
    const nights = calculateNights(booking.check_in, booking.check_out);
    const dsdaCharge = includeAdditionalCharges ? (booking.dsda_charge || 0) : 0;
    const advancePayment = booking.advance_payment || 0;
    
    const doc = new jsPDF();
    const themeColors: Record<string, string> = {
      emerald: '#059669',
      indigo: '#4f46e5',
      rose: '#e11d48',
      amber: '#d97706',
      slate: '#475569'
    };

    const primaryColor = themeColors[hotelSettings.theme] || '#059669';

    const subtotal = groupBookings.reduce((acc, curr) => acc + (curr.room_price * nights), 0);
    const total = Math.round(subtotal + dsdaCharge);
    const balance = Math.round(total - advancePayment);

    // Save to DB
    if (!skipSave) {
      await saveBillToDb(booking, 'Normal', total, subtotal, 0, dsdaCharge, groupBookings);
    }

    const copyLabels = ['Original for Recipient', 'Duplicate for Supplier'];

    for (let i = 0; i < copyLabels.length; i++) {
      if (i > 0) doc.addPage();
      
      // Copy Label
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.setFont('helvetica', 'bold');
      doc.text(copyLabels[i].toUpperCase(), 190, 10, { align: 'right' });

      // --- NEW PROFESSIONAL DESIGN ---
      
      // 1. Header with Logo
      if (hotelSettings.logo_url) {
        try {
          const logoBase64 = await getBase64ImageFromURL(hotelSettings.logo_url);
          doc.addImage(logoBase64, 'PNG', 20, 15, 25, 25);
        } catch (e) {
          console.error("Logo load error", e);
        }
      }

      // Hotel Name & Details (Right Aligned)
      doc.setTextColor(primaryColor);
      doc.setFontSize(22);
      doc.setFont('helvetica', 'bold');
      doc.text(hotelSettings.hotel_name.toUpperCase(), 190, 25, { align: 'right' });
      
      doc.setTextColor(100, 100, 100);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(hotelSettings.hotel_address, 190, 32, { align: 'right' });
      doc.text(hotelSettings.contact_info, 190, 37, { align: 'right' });

      // Accent Line
      doc.setDrawColor(primaryColor);
      doc.setLineWidth(1.5);
      doc.line(20, 45, 190, 45);

      // Title
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('BOOKING CONFIRMATION', 20, 55);

      // Info Grid
      doc.setFontSize(9);
      doc.setTextColor(100, 100, 100);
      doc.text('GUEST DETAILS:', 20, 65);
      doc.text('BOOKING DETAILS:', 120, 65);

      doc.setTextColor(0, 0, 0);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(booking.guest_name, 20, 71);
      doc.setFont('helvetica', 'normal');
      doc.text(`Email: ${booking.guest_email}`, 20, 76);
      doc.text(`Phone: ${booking.guest_phone}`, 20, 81);
      doc.text(`Occupancy: ${booking.adults} Adults, ${booking.children} Children`, 20, 86);

      const invoiceId = getInvoiceId(booking);
      doc.text(`Invoice No: ${invoiceId}`, 120, 71);
      doc.text(`Date: ${formatDateDDMMYYYY(new Date())}`, 120, 76);
      doc.text(`Stay: ${formatDateDDMMYYYY(booking.check_in)} to ${formatDateDDMMYYYY(booking.check_out)}`, 120, 81);
      doc.text(`Plan: ${booking.plan || 'Only Room'}`, 120, 86);

      // Table
      const roomRows = groupBookings.map(b => {
        return [
          b.room_type,
          nights.toString(),
          `Rs. ${b.room_price}`,
          `Rs. ${b.room_price * nights}`
        ];
      });

      autoTable(doc, {
        startY: 95,
        head: [['Room Type', 'Nights', 'Price', 'Total']],
        body: roomRows,
        headStyles: { 
          fillColor: [250, 250, 250], 
          textColor: [0, 0, 0], 
          fontStyle: 'bold',
          lineWidth: 0.1,
          lineColor: [200, 200, 200]
        },
        bodyStyles: {
          fontSize: 9,
          cellPadding: 5
        },
        alternateRowStyles: {
          fillColor: [252, 252, 252]
        },
        margin: { left: 20, right: 20 }
      });

      let finalY = (doc as any).lastAutoTable.finalY + 15;
      
      if (finalY > 240) {
        doc.addPage();
        finalY = 20;
      }
    
    const drawRow = (label: string, value: string, y: number, isBold: boolean = false, isPrimary: boolean = false) => {
      if (isBold) {
        doc.setFont('helvetica', 'bold');
        if (isPrimary) {
          doc.setTextColor(primaryColor);
        } else {
          doc.setTextColor(0, 0, 0);
        }
      } else {
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 100, 100);
      }
      doc.text(label, 120, y);
      doc.text(value, 190, y, { align: 'right' });
    };

    drawRow('Subtotal:', `Rs. ${subtotal.toFixed(2)}`, finalY + 8);
    
    let currentY = finalY + 8;
    if (dsdaCharge > 0) {
      currentY += 7;
      drawRow(`${hotelSettings.additional_charge_name || 'Additional Charge'}:`, `Rs. ${dsdaCharge.toFixed(2)}`, currentY);
    }

    currentY += 10;
    doc.setDrawColor(primaryColor);
    doc.setLineWidth(0.5);
    doc.line(110, currentY - 5, 190, currentY - 5);
    
    doc.setFontSize(12);
    drawRow('TOTAL AMOUNT:', `Rs. ${total}`, currentY + 2, true, true);

    doc.setFontSize(10);
    currentY += 10;
    drawRow('Advance Paid:', `Rs. ${advancePayment.toFixed(2)}`, currentY);
    currentY += 7;
    drawRow('BALANCE DUE:', `Rs. ${balance}`, currentY, true);

    // Footer
    const footerY = 275;
    doc.setFontSize(9);
    doc.setTextColor(150, 150, 150);
    doc.setFont('helvetica', 'italic');
    doc.text(`Thank you for choosing ${hotelSettings.hotel_name}! We look forward to serving you.`, 105, footerY, { align: 'center' });

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('This is a computer generated invoice. Signature not required.', 105, footerY + 7, { align: 'center' });
    doc.text('Check-in: 10:30 AM | Check-out: 09:30 AM', 105, footerY + 12, { align: 'center' });
    }

    doc.save(`Receipt-${booking.booking_id}.pdf`);
  };

  const generateMonthlyReportPDF = (monthStr: string) => {
    const [year, month] = monthStr.split('-');
    const monthName = new Date(parseInt(year), parseInt(month) - 1).toLocaleString('default', { month: 'long' });
    
    const filteredBills = allBills.filter(b => b.check_in.startsWith(monthStr));
    
    const doc = new jsPDF();
    const themeColors: Record<string, string> = {
      emerald: '#059669',
      indigo: '#4f46e5',
      rose: '#e11d48',
      amber: '#d97706',
      slate: '#475569'
    };
    const primaryColor = themeColors[hotelSettings.theme] || '#059669';

    // Header
    doc.setTextColor(primaryColor);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text(hotelSettings.hotel_name.toUpperCase(), 105, 25, { align: 'center' });
    
    doc.setTextColor(100, 100, 100);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`${hotelSettings.hotel_address} | GSTIN: ${hotelSettings.gst_number || 'N/A'}`, 105, 32, { align: 'center' });
    
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(`MONTHLY BILLING REPORT - ${monthName.toUpperCase()} ${year}`, 105, 45, { align: 'center' });

    // Table
    const tableRows = filteredBills.map(b => {
      return [
        b.invoice_id,
        formatDateDDMMYYYY(b.check_in),
        b.guest_name,
        'Multiple/Manual',
        'N/A',
        `Rs. ${b.total_amount}`
      ];
    });

    const totalRevenue = filteredBills.reduce((acc, b) => acc + b.total_amount, 0);

    autoTable(doc, {
      startY: 55,
      head: [['Invoice ID', 'Date', 'Guest', 'Room', 'Nights', 'Total Amount']],
      body: tableRows,
      headStyles: { fillColor: [240, 240, 240], textColor: [0, 0, 0], fontStyle: 'bold' },
      foot: [['', '', '', '', 'GRAND TOTAL:', `Rs. ${totalRevenue}`]],
      footStyles: { fillColor: [250, 250, 250], textColor: [0, 0, 0], fontStyle: 'bold' },
      margin: { left: 15, right: 15 }
    });

    doc.save(`Monthly-Report-${monthStr}.pdf`);
  };

  const deleteBooking = async (bookingId: number) => {
    if (window.confirm('Are you sure you want to delete this bill/booking?')) {
      setAllBookings(prev => prev.filter(b => b.id !== bookingId));
    }
  };

  const clearAllBookings = async () => {
    if (window.confirm('WARNING: This will delete ALL billing history. This action cannot be undone. Are you sure?')) {
      setAllBookings([]);
    }
  };

  const generateMonthlyExcelReport = (monthStr: string) => {
    const filteredBills = allBills.filter(b => b.check_in.startsWith(monthStr));
    
    const reportData = filteredBills.map(b => ({
      'Invoice ID': b.invoice_id,
      'Date': formatDateDDMMYYYY(b.check_in),
      'Guest Name': b.guest_name,
      'Phone': b.guest_phone,
      'GSTIN': b.guest_gst || 'N/A',
      'Base Price': b.base_price,
      'GST Amount': b.gst_amount,
      'Additional Charge': b.dsda_charge,
      'Total Amount': b.total_amount,
      'Bill Type': b.bill_type
    }));

    const worksheet = XLSX.utils.json_to_sheet(reportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Monthly Report');
    XLSX.writeFile(workbook, `Monthly_Report_${monthStr}.xlsx`);
  };

  const generateGSTBillPDF = async (booking: Booking, includeAdditionalCharges: boolean = true, customGroupBookings?: Booking[], skipSave: boolean = false) => {
    let groupBookings = customGroupBookings || allBookings.filter(b => b.booking_id === booking.booking_id);
    if (groupBookings.length === 0) {
      groupBookings = [booking];
    }
    const doc = new jsPDF();
    const themeColors: Record<string, string> = {
      emerald: '#059669',
      indigo: '#4f46e5',
      rose: '#e11d48',
      amber: '#d97706',
      slate: '#475569'
    };
    const primaryColor = themeColors[hotelSettings.theme] || '#059669';
    const nights = calculateNights(booking.check_in, booking.check_out);
    const additionalCharge = includeAdditionalCharges ? (booking.dsda_charge || 0) : 0;
    
    const roomRows = groupBookings.map(b => {
      const roomTotal = b.room_price * nights;
      return [
        `Room Accommodation (#${b.room_number} - ${b.room_type})`,
        '9963',
        nights.toString(),
        `Rs. ${b.room_price}`,
        `Rs. ${roomTotal}`
      ];
    });

    const totalRoomAmount = groupBookings.reduce((acc, curr) => acc + (curr.room_price * nights), 0);
    const subtotal = totalRoomAmount + additionalCharge;
    
    let gstRate = 0;
    if (booking.room_price >= 7500) {
      gstRate = 0.18;
    } else if (booking.room_price >= 1000) {
      gstRate = 0.05;
    } else {
      gstRate = 0;
    }

    const guestGST = (booking as any).guest_gst || '';
    const isInterState = guestGST && guestGST.substring(0, 2) !== (hotelSettings.state_code || '19');
    
    const cgstRate = isInterState ? 0 : gstRate / 2;
    const sgstRate = isInterState ? 0 : gstRate / 2;
    const igstRate = isInterState ? gstRate : 0;
    
    const cgstAmount = totalRoomAmount * cgstRate;
    const sgstAmount = totalRoomAmount * sgstRate;
    const igstAmount = totalRoomAmount * igstRate;
    const totalWithTax = subtotal + cgstAmount + sgstAmount + igstAmount;
    const grandTotal = Math.round(totalWithTax);
    const roundOff = grandTotal - totalWithTax;

    // Save to DB
    if (!skipSave) {
      await saveBillToDb(booking, 'GST', grandTotal, subtotal, cgstAmount + sgstAmount + igstAmount, additionalCharge, groupBookings);
    }

    const copyLabels = ['Original for Recipient', 'Duplicate for Supplier'];

    for (let i = 0; i < copyLabels.length; i++) {
      if (i > 0) doc.addPage();
      
      // Copy Label
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.setFont('helvetica', 'bold');
      doc.text(copyLabels[i].toUpperCase(), 190, 10, { align: 'right' });

      // --- NEW PROFESSIONAL DESIGN ---
    
    // 1. Header with Logo
    if (hotelSettings.logo_url) {
      try {
        const logoBase64 = await getBase64ImageFromURL(hotelSettings.logo_url);
        doc.addImage(logoBase64, 'PNG', 20, 15, 25, 25);
      } catch (e) {
        console.error("Logo load error", e);
      }
    }

    // Hotel Name & Details (Right Aligned)
    doc.setTextColor(primaryColor);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text(hotelSettings.hotel_name.toUpperCase(), 190, 25, { align: 'right' });
    
    doc.setTextColor(100, 100, 100);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(hotelSettings.hotel_address, 190, 32, { align: 'right' });
    doc.text(`GSTIN: ${hotelSettings.gst_number || 'N/A'} | Contact: ${hotelSettings.contact_info}`, 190, 37, { align: 'right' });

    // Accent Line
    doc.setDrawColor(primaryColor);
    doc.setLineWidth(1.5);
    doc.line(20, 45, 190, 45);

    // Title
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('TAX INVOICE', 20, 55);

    // Info Grid
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text('BILL TO:', 20, 65);
    doc.text('INVOICE DETAILS:', 120, 65);

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(booking.guest_name, 20, 71);
    doc.setFont('helvetica', 'normal');
    doc.text(`Address: ${(booking as any).guest_address || 'N/A'}`, 20, 76);
    doc.text(`GSTIN: ${guestGST || 'N/A'}`, 20, 81);
    doc.text(`Phone: ${booking.guest_phone || 'N/A'}`, 20, 86);

    const invoiceId = getInvoiceId(booking);
    doc.text(`Invoice No: ${invoiceId}`, 120, 71);
    doc.text(`Date: ${formatDateDDMMYYYY(new Date())}`, 120, 76);
    doc.text(`Booking ID: ${booking.booking_id}`, 120, 81);
    doc.text(`Stay: ${formatDateDDMMYYYY(booking.check_in)} to ${formatDateDDMMYYYY(booking.check_out)}`, 120, 86);

    // Table
    const tableBody = [...roomRows];
    if (includeAdditionalCharges && additionalCharge > 0) {
      tableBody.push([hotelSettings.additional_charge_name || 'Additional Charge', '9963', '1', `Rs. ${additionalCharge}`, `Rs. ${additionalCharge}`]);
    }

    autoTable(doc, {
      startY: 95,
      head: [['Description', 'SAC/HSN', 'Qty/Days', 'Rate', 'Amount']],
      body: tableBody,
      headStyles: { 
        fillColor: [250, 250, 250], 
        textColor: [0, 0, 0], 
        fontStyle: 'bold',
        lineWidth: 0.1,
        lineColor: [200, 200, 200]
      },
      bodyStyles: {
        fontSize: 9,
        cellPadding: 5
      },
      alternateRowStyles: {
        fillColor: [252, 252, 252]
      },
      margin: { left: 20, right: 20 }
    });

    let finalY = (doc as any).lastAutoTable.finalY + 10;

    if (finalY > 230) {
      doc.addPage();
      finalY = 20;
    }

    // Summary Section
    doc.setDrawColor(230, 230, 230);
    doc.line(110, finalY, 190, finalY);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    
    const drawRow = (label: string, value: string, y: number, isBold: boolean = false) => {
      if (isBold) {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 0, 0);
      } else {
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 100, 100);
      }
      doc.text(label, 120, y);
      doc.text(value, 190, y, { align: 'right' });
    };

    drawRow('Subtotal:', `Rs. ${subtotal.toFixed(2)}`, finalY + 8);
    
    let currentY = finalY + 8;
    if (isInterState) {
      currentY += 7;
      drawRow(`IGST (${igstRate * 100}%):`, `Rs. ${igstAmount.toFixed(2)}`, currentY);
    } else {
      currentY += 7;
      drawRow(`CGST (${cgstRate * 100}%):`, `Rs. ${cgstAmount.toFixed(2)}`, currentY);
      currentY += 7;
      drawRow(`SGST (${sgstRate * 100}%):`, `Rs. ${sgstAmount.toFixed(2)}`, currentY);
    }

    if (Math.abs(roundOff) > 0.001) {
      currentY += 7;
      drawRow('Round Off:', `Rs. ${roundOff.toFixed(2)}`, currentY);
    }

    currentY += 10;
    doc.setDrawColor(primaryColor);
    doc.setLineWidth(0.5);
    doc.line(110, currentY - 5, 190, currentY - 5);
    
    doc.setFontSize(12);
    drawRow('GRAND TOTAL:', `Rs. ${grandTotal}`, currentY + 2, true);

    // Footer & Signature
    const footerY = 260;
    
    if (hotelSettings.signature_url) {
      try {
        const sigBase64 = await getBase64ImageFromURL(hotelSettings.signature_url);
        doc.addImage(sigBase64, 'PNG', 150, currentY + 20, 35, 15);
      } catch (e) {
        console.error("Signature load error", e);
      }
    }
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Authorized Signature', 167.5, currentY + 40, { align: 'center' });

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(150, 150, 150);
    doc.text('TERMS & CONDITIONS:', 20, footerY);
    doc.text('1. This is a computer generated invoice.', 20, footerY + 5);
    doc.text('2. Goods once sold will not be taken back.', 20, footerY + 10);
    doc.text('3. All disputes are subject to local jurisdiction.', 20, footerY + 15);
    }

    doc.save(`${booking.guest_name}_GST_Bill_${booking.booking_id}.pdf`);
  };

  const generateAdvanceReceiptPDF = async () => {
    if (!lastBookingDetails) return;
    const doc = new jsPDF();
    const advancePayment = lastBookingDetails.advancePayment || 0;
    const nights = calculateNights(lastBookingDetails.checkIn, lastBookingDetails.checkOut);
    
    const themeColors: Record<string, string> = {
      emerald: '#059669',
      indigo: '#4f46e5',
      rose: '#e11d48',
      amber: '#d97706',
      slate: '#475569'
    };
    const primaryColor = themeColors[hotelSettings.theme] || '#059669';

    // Header
    doc.setFillColor(primaryColor);
    doc.rect(0, 0, 210, 40, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text(hotelSettings.hotel_name, 20, 20);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(hotelSettings.hotel_address, 20, 28);
    doc.text(hotelSettings.contact_info, 20, 33);

    if (hotelSettings.logo_url) {
      try {
        const logoBase64 = await getBase64ImageFromURL(hotelSettings.logo_url);
        doc.addImage(logoBase64, 'PNG', 170, 5, 25, 25);
      } catch (e) {
        console.error("Error adding logo to PDF", e);
      }
    }

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('ADVANCE PAYMENT RECEIPT', 140, 35);

    // Booking ID & Date
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Booking ID:', 20, 55);
    doc.setFont('helvetica', 'normal');
    doc.text(lastBookingDetails.bookingId, 50, 55);
    
    doc.setFont('helvetica', 'bold');
    doc.text('Date:', 140, 55);
    doc.setFont('helvetica', 'normal');
    doc.text(formatDateDDMMYYYY(new Date()), 160, 55);

    // Guest Details
    doc.setDrawColor(200, 200, 200);
    doc.line(20, 65, 190, 65);
    
    doc.setFont('helvetica', 'bold');
    doc.text('GUEST DETAILS', 20, 75);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Name: ${lastBookingDetails.guestName}`, 20, 85);
    doc.text(`Email: ${lastBookingDetails.guestEmail}`, 20, 92);
    doc.text(`Phone: ${lastBookingDetails.guestPhone}`, 20, 99);

    // Payment Details
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('PAYMENT DETAILS', 20, 115);
    
    autoTable(doc, {
      startY: 120,
      head: [['Description', 'Amount']],
      body: [
        ['Advance Payment for Booking', `Rs. ${advancePayment.toFixed(2)}`],
        ['Stay Duration', `${nights} Days (${formatDateDDMMYYYY(lastBookingDetails.checkIn)} to ${formatDateDDMMYYYY(lastBookingDetails.checkOut)})`],
        ['Room Type(s)', lastBookedRooms.map(r => r.type).join(', ')]
      ],
      headStyles: { fillColor: primaryColor }
    });

    // Summary
    const finalY = (doc as any).lastAutoTable.finalY + 20;
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(primaryColor);
    doc.text('Advance Amount Paid:', 20, finalY);
    doc.text(`Total Advance Paid:`, 80, finalY);
    doc.text(`Rs. ${Math.round(advancePayment)}`, 140, finalY);

    // Note
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text('Note: This is an advance payment receipt. Room numbers will be assigned upon check-in.', 20, finalY + 15);

    // Footer
    doc.setFontSize(10);
    doc.setTextColor(150, 150, 150);
    doc.setFont('helvetica', 'italic');
    doc.text(`Thank you for choosing ${hotelSettings.hotel_name}!`, 105, 275, { align: 'center' });

    doc.setFontSize(8);
    doc.text('This is a computer generated invoice. Signature not required.', 105, 282, { align: 'center' });

    doc.save(`Advance-Receipt-${lastBookingDetails.bookingId}.pdf`);
  };

  const downloadReceipt = () => {
    if (!lastBookingDetails) return;
    const dsdaCharge = parseFloat(hotelSettings.dsda_charge || '0');
    const totalAmount = Math.round(lastBookedRooms.reduce((acc, curr) => acc + ((customPrices[curr.id] || curr.price) * calculateNights(lastBookingDetails.checkIn, lastBookingDetails.checkOut)), 0) + dsdaCharge);
    const content = `
${hotelSettings.hotel_name.toUpperCase()} BOOKING RECEIPT
-------------------------
Booking ID: ${lastBookingDetails.bookingId}
Date: ${formatDateDDMMYYYY(new Date())}

GUEST DETAILS
Name: ${lastBookingDetails.guestName}
Email: ${lastBookingDetails.guestEmail}
Phone: ${lastBookingDetails.guestPhone}
Guests: ${lastBookingDetails.adults} Adults, ${lastBookingDetails.children} Children

STAY DETAILS
Check-in: ${formatDateDDMMYYYY(lastBookingDetails.checkIn)} (10:30 AM)
Check-out: ${formatDateDDMMYYYY(lastBookingDetails.checkOut)} (09:30 AM)
Default Check-out Time: 09:30 AM
Days: ${calculateNights(lastBookingDetails.checkIn, lastBookingDetails.checkOut)}
Plan: ${lastBookingDetails.selectedPlan}

ROOMS
${lastBookedRooms.map(r => `Room (${r.type}): Rs. ${customPrices[r.id] || r.price}/day - Total: Rs. ${(customPrices[r.id] || r.price) * calculateNights(lastBookingDetails.checkIn, lastBookingDetails.checkOut)}`).join('\n')}

${dsdaCharge > 0 ? `${hotelSettings.additional_charge_name || 'Additional Charge'}: Rs. ${dsdaCharge}\n` : ''}
TOTAL AMOUNT: Rs. ${totalAmount}
-------------------------
Thank you for choosing ${hotelSettings.hotel_name}!
    `;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Receipt-${lastBookingDetails.bookingId}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const shareReceipt = async () => {
    if (!lastBookingDetails) return;
    const dsdaCharge = parseFloat(hotelSettings.dsda_charge || '0');
    const totalAmount = lastBookedRooms.reduce((acc, curr) => acc + ((customPrices[curr.id] || curr.price) * calculateNights(lastBookingDetails.checkIn, lastBookingDetails.checkOut)), 0) + dsdaCharge;
    const shareData = {
      title: `${hotelSettings.hotel_name} Booking Receipt`,
      text: `${hotelSettings.hotel_name} Booking Confirmed!\nID: ${lastBookingDetails.bookingId}\nGuest: ${lastBookingDetails.guestName}\nTotal: Rs. ${totalAmount}`,
      url: window.location.href
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(shareData.text);
        alert('Receipt details copied to clipboard!');
      }
    } catch (err) {
      console.error('Error sharing:', err);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1A1A1A] font-sans selection:bg-primary-light">
      {/* Header */}
      <header className="bg-white border-b border-black/5 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-white overflow-hidden">
              {hotelSettings.logo_url ? (
                <img src={hotelSettings.logo_url} alt="Logo" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <Hotel size={24} />
              )}
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">{hotelSettings.hotel_name}</h1>
              <div className="flex items-center gap-2">
                <div className={`w-1.5 h-1.5 rounded-full ${isLive ? 'bg-primary animate-pulse' : (isConnected ? 'bg-blue-500' : 'bg-rose-500')}`} />
                <span className="text-[9px] font-bold uppercase tracking-widest text-black/30">
                  {isLive ? 'Live' : (isConnected ? (isNetlify ? 'Cloud Sync' : 'Connected') : 'Offline')}
                </span>
              </div>
            </div>
          </div>
          <nav className="flex items-center gap-6 md:gap-8 text-[11px] md:text-sm font-bold uppercase tracking-widest text-black/40 overflow-x-auto no-scrollbar pb-1 md:pb-0">
            <button 
              onClick={() => setActiveView('availability')}
              className={`hover:text-primary transition-colors flex-shrink-0 ${activeView === 'availability' ? 'text-primary' : ''}`}
            >
              Check Availability
            </button>
            <button 
              onClick={() => setActiveView('bookings')}
              className={`hover:text-primary transition-colors flex-shrink-0 ${activeView === 'bookings' ? 'text-primary' : ''}`}
            >
              View Bookings
            </button>
            <button 
              onClick={() => setActiveView('profiles')}
              className={`hover:text-primary transition-colors flex-shrink-0 ${activeView === 'profiles' ? 'text-primary' : ''}`}
            >
              Guest Profiles
            </button>
            <button 
              onClick={() => setActiveView('billing')}
              className={`hover:text-primary transition-colors flex-shrink-0 ${activeView === 'billing' ? 'text-primary' : ''}`}
            >
              Billing
            </button>
            <button 
              onClick={() => setActiveView('all_bills')}
              className={`hover:text-primary transition-colors flex-shrink-0 ${activeView === 'all_bills' ? 'text-primary' : ''}`}
            >
              All Bills
            </button>
            <button 
              onClick={() => setActiveView('settings')}
              className={`hover:text-primary transition-colors flex-shrink-0 ${activeView === 'settings' ? 'text-primary' : ''}`}
            >
              Settings
            </button>
            <button 
              onClick={() => setActiveView('inventory')}
              className={`hover:text-primary transition-colors flex-shrink-0 ${activeView === 'inventory' ? 'text-primary' : ''}`}
            >
              Inventory
            </button>
          </nav>
        </div>
      </header>

      {dbError && (
        <div className="bg-rose-50 border-b border-rose-100 px-6 py-3">
          <div className="max-w-7xl mx-auto flex items-center gap-3 text-rose-700">
            <Info size={18} />
            <p className="text-sm font-medium">
              Database connection issue: {dbError}. 
              Please check your Supabase credentials in Settings &gt; Secrets.
            </p>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-6 py-12">
        {activeView === 'availability' ? (
          <div className="grid lg:grid-cols-12 gap-12">
            
            {/* Form Section */}
            <div className="lg:col-span-5">
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-3xl p-8 shadow-sm border border-black/5"
              >
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-2xl font-semibold flex items-center gap-3">
                    <Search className="text-primary" size={24} />
                    Check Availability
                  </h2>
                  {isLive && (
                    <div className="flex items-center gap-2 px-3 py-1 bg-primary-light rounded-full border border-primary-light">
                      <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                      <span className="text-[10px] font-bold text-primary-text uppercase tracking-widest">Live Inventory</span>
                    </div>
                  )}
                </div>

                <form onSubmit={checkAvailability} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-black/40 flex items-center gap-2">
                      <DoorOpen size={14} /> Room Number
                    </label>
                    <select 
                      required
                      value={roomNumber}
                      onChange={(e) => setRoomNumber(e.target.value)}
                      className="w-full h-12 px-4 rounded-xl bg-black/5 border-transparent focus:bg-white focus:border-primary focus:ring-0 transition-all outline-none"
                    >
                      <option value="">Select a room...</option>
                      {rooms.map(room => (
                        <option key={room.id} value={room.room_number}>
                          Room {room.room_number} — {room.type}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-black/40 flex items-center gap-2">
                        <Calendar size={14} /> Check-in
                      </label>
                      <input 
                        type="date" 
                        required
                        value={checkIn}
                        onChange={(e) => setCheckIn(e.target.value)}
                        className="w-full h-12 px-4 rounded-xl bg-black/5 border-transparent focus:bg-white focus:border-primary focus:ring-0 transition-all outline-none"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-black/40 flex items-center gap-2">
                        <Calendar size={14} /> Check-out
                      </label>
                      <input 
                        type="date" 
                        required
                        value={checkOut}
                        onChange={(e) => setCheckOut(e.target.value)}
                        className="w-full h-12 px-4 rounded-xl bg-black/5 border-transparent focus:bg-white focus:border-primary focus:ring-0 transition-all outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-black/40 flex items-center gap-2">
                        <Clock size={14} /> Check-in Time
                      </label>
                      <div className="w-full h-12 px-4 rounded-xl bg-black/5 flex items-center text-sm font-medium text-black/60">
                        10:30 AM (Default)
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-black/40 flex items-center gap-2">
                        <Clock size={14} /> Check-out Time
                      </label>
                      <input 
                        type="time" 
                        required
                        value={departureTime}
                        onChange={(e) => setDepartureTime(e.target.value)}
                        className="w-full h-12 px-4 rounded-xl bg-black/5 border-transparent focus:bg-white focus:border-primary focus:ring-0 transition-all outline-none"
                      />
                      <p className="text-[10px] text-black/30 font-medium">Default: 09:30 AM</p>
                    </div>
                  </div>

                  <button 
                    type="submit"
                    disabled={loading}
                    className="w-full h-14 bg-primary hover:bg-primary-hover text-white rounded-2xl font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed group"
                  >
                    {loading ? 'Searching...' : 'Check Availability'}
                    {!loading && <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />}
                  </button>
                </form>
              </motion.div>

              {/* Daily Bookings Section */}
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-white rounded-3xl p-8 shadow-sm border border-black/5 mt-8"
              >
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-semibold flex items-center gap-3">
                    <Calendar className="text-primary" size={20} />
                    Daily Bookings
                  </h3>
                  <input 
                    type="date" 
                    value={dailyBookingsDate}
                    onChange={(e) => setDailyBookingsDate(e.target.value)}
                    className="text-xs font-bold bg-black/5 px-3 py-2 rounded-lg border-transparent focus:bg-white focus:border-primary focus:ring-0 outline-none transition-all"
                  />
                </div>

                <div className="space-y-4">
                  {(() => {
                    const dayBookings = allBookings.filter(b => 
                      b.status === 'confirmed' && 
                      b.check_in <= dailyBookingsDate && 
                      b.check_out > dailyBookingsDate
                    );
                    
                    // Group by booking_id to avoid double counting rooms in the same booking
                    // Actually, the user wants "how many room booked", so we count unique room_numbers
                    const bookedRooms = Array.from(new Set(dayBookings.map(b => b.room_number)));
                    
                    if (dayBookings.length === 0) {
                      return (
                        <div className="text-center py-8 bg-black/2 px-4 rounded-2xl border border-dashed border-black/5">
                          <p className="text-sm text-black/40">No bookings for this date</p>
                        </div>
                      );
                    }

                    return (
                      <>
                        <div className="flex items-center justify-between p-4 bg-primary-light rounded-2xl border border-primary-light/50">
                          <span className="text-sm font-bold text-primary">Total Rooms Booked</span>
                          <span className="text-xl font-black text-primary">{bookedRooms.length}</span>
                        </div>
                        
                        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 no-scrollbar">
                          {dayBookings.map((booking, idx) => (
                            <div key={idx} className="p-4 bg-black/2 rounded-2xl border border-black/5 flex items-center justify-between hover:bg-black/5 transition-colors">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-white rounded-xl flex items-center justify-center text-primary shadow-sm font-bold text-xs">
                                  {booking.room_number}
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-sm font-bold truncate max-w-[120px]">{booking.guest_name}</span>
                                  <div className="flex items-center gap-2 text-[10px] text-black/40 uppercase tracking-widest font-bold">
                                    <span>{booking.room_type}</span>
                                    <span>•</span>
                                    <span className="flex items-center gap-1"><Phone size={10} /> {booking.guest_phone}</span>
                                  </div>
                                </div>
                              </div>
                              <div className="text-right">
                                <span className="text-[10px] font-bold text-black/40 block">PLAN</span>
                                <span className="text-[10px] font-bold text-primary">{booking.plan}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    );
                  })()}
                </div>
              </motion.div>
            </div>

            {/* Results Section */}
            <div className="lg:col-span-7">
              <AnimatePresence mode="wait">
                {result ? (
                  <motion.div
                    key="result"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className={`rounded-3xl p-10 border ${result.available ? 'bg-primary-light border-primary-light' : 'bg-rose-50 border-rose-100'}`}
                  >
                    <div className="flex items-start justify-between mb-8">
                      <div>
                        <div className="flex flex-wrap gap-4 mb-4">
                          <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-bold uppercase tracking-wider ${result.available ? 'bg-primary text-white' : 'bg-rose-600 text-white'}`}>
                            {result.available ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                            {result.available ? 'Available' : 'Unavailable'}
                          </div>
                          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-bold uppercase tracking-wider bg-black/5 text-black/60">
                            <Bed size={16} />
                            {result.rooms.filter(r => r.is_available).length} Available
                          </div>
                          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-bold uppercase tracking-wider bg-rose-50 text-rose-600">
                            <XCircle size={16} />
                            {result.rooms.filter(r => !r.is_available).length} Rooms Booked
                          </div>
                        </div>
                        <h3 className="text-3xl font-bold">
                          {result.available ? 'Room Availability Found' : 'No Rooms Available'}
                        </h3>
                        <p className="text-black/40 text-sm mt-2">
                          Default Check-in: 10:30 AM | Check-out: 09:30 AM
                        </p>
                      </div>
                    </div>

                    {result ? (
                      <div className="space-y-8">
                        <div className="space-y-3">
                          <div className="flex items-center gap-4">
                            <label className="text-xs font-bold uppercase tracking-wider text-black/40 flex items-center gap-2">
                              <Bed size={14} /> Room Status
                            </label>
                          </div>
                          {result.rooms.filter(r => r.is_available).length > 1 && (
                              <button 
                                onClick={() => {
                                  const availableRooms = result.rooms.filter(r => r.is_available);
                                  if (selectedRoomIds.length === availableRooms.length) {
                                    setSelectedRoomIds([]);
                                    setRoomAcTypes({});
                                  } else {
                                    setSelectedRoomIds(availableRooms.map(r => r.id));
                                    const newAcTypes = { ...roomAcTypes };
                                    availableRooms.forEach(r => {
                                      if (!newAcTypes[r.id]) newAcTypes[r.id] = 'Non-AC';
                                    });
                                    setRoomAcTypes(newAcTypes);
                                  }
                                }}
                                className="text-[10px] font-bold text-primary hover:underline"
                              >
                                {selectedRoomIds.length === result.rooms.filter(r => r.is_available).length ? 'Deselect All' : 'Select All Available'}
                              </button>
                            )}
                          </div>
                          <div className="grid gap-3">
                            {result.rooms
                              .map(room => (
                              <div 
                                key={room.id}
                                onClick={() => {
                                  if (!room.is_available) return;
                                  if (selectedRoomIds.includes(room.id)) {
                                    setSelectedRoomIds(selectedRoomIds.filter(id => id !== room.id));
                                    const newAcTypes = { ...roomAcTypes };
                                    delete newAcTypes[room.id];
                                    setRoomAcTypes(newAcTypes);
                                  } else {
                                    setSelectedRoomIds([...selectedRoomIds, room.id]);
                                    setRoomAcTypes({ ...roomAcTypes, [room.id]: 'Non-AC' });
                                  }
                                }}
                                className={`p-4 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${!room.is_available ? 'bg-rose-50/30 border-rose-100/50 opacity-80 cursor-not-allowed' : selectedRoomIds.includes(room.id) ? 'bg-primary text-white border-primary shadow-md cursor-pointer' : 'bg-white text-black border-black/5 hover:border-primary cursor-pointer'}`}
                              >
                                <div className="flex items-center gap-4">
                                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${!room.is_available ? 'border-rose-200 bg-rose-50' : selectedRoomIds.includes(room.id) ? 'border-white bg-white/20' : 'border-black/10'}`}>
                                    {!room.is_available ? <XCircle size={14} className="text-rose-500" /> : selectedRoomIds.includes(room.id) && <CheckCircle2 size={14} />}
                                  </div>
                                  
                                  <div>
                                    <p className={`font-bold ${!room.is_available ? 'text-rose-900/60' : ''}`}>Room {room.room_number}</p>
                                    <div className="flex items-center gap-2">
                                      <p className={`text-xs ${selectedRoomIds.includes(room.id) && room.is_available ? 'text-white/70' : 'text-black/40'}`}>{room.type}</p>
                                    </div>
                                    {!room.is_available && (
                                      <span className="mt-1 inline-block text-[9px] font-black bg-rose-100 text-rose-600 px-2 py-0.5 rounded-full uppercase tracking-tight">
                                        Booked
                                      </span>
                                    )}
                                  </div>
                                </div>
                                  {room.is_available && (
                                    <div className="text-right flex flex-col items-end gap-2">
                                      {selectedRoomIds.includes(room.id) && (
                                        <div className="flex bg-white/10 rounded-lg p-0.5 border border-white/20 mb-1" onClick={(e) => e.stopPropagation()}>
                                          <button
                                            onClick={() => setRoomAcTypes({ ...roomAcTypes, [room.id]: 'AC' })}
                                            className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${roomAcTypes[room.id] === 'AC' ? 'bg-white text-primary shadow-sm' : 'text-white/60 hover:text-white'}`}
                                          >
                                            AC
                                          </button>
                                          <button
                                            onClick={() => setRoomAcTypes({ ...roomAcTypes, [room.id]: 'Non-AC' })}
                                            className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all ${roomAcTypes[room.id] === 'Non-AC' ? 'bg-white text-primary shadow-sm' : 'text-white/60 hover:text-white'}`}
                                          >
                                            Non-AC
                                          </button>
                                        </div>
                                      )}
                                      <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-bold uppercase opacity-50">Total Fare (Incl. GST):</span>
                                        <input 
                                          type="number"
                                          placeholder="Total Fare"
                                          onChange={(e) => {
                                            const totalFare = parseFloat(e.target.value) || 0;
                                            let basePrice = totalFare;
                                            // Reverse GST calculation
                                            // If base >= 7500, GST is 18% (total = base * 1.18 => base = total / 1.18)
                                            // If base >= 1000, GST is 5% (total = base * 1.05 => base = total / 1.05)
                                            
                                            // We need to check which bracket it falls into
                                            // Bracket 1: base >= 7500 => total >= 8850
                                            // Bracket 2: base >= 1000 => total >= 1050
                                            
                                            if (totalFare >= 8850) {
                                              basePrice = totalFare / 1.18;
                                            } else if (totalFare >= 1050) {
                                              basePrice = totalFare / 1.05;
                                            }
                                            
                                            setCustomPrices({...customPrices, [room.id]: parseFloat(basePrice.toFixed(2))});
                                          }}
                                          className={`w-24 h-8 px-2 rounded-lg text-sm font-bold border transition-all outline-none ${selectedRoomIds.includes(room.id) ? 'bg-white/20 border-white/30 text-white placeholder:text-white/40' : 'bg-black/5 border-black/5 focus:bg-white focus:border-primary'}`}
                                        />
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-bold uppercase opacity-50">Base Price:</span>
                                        <input 
                                          type="number"
                                          value={customPrices[room.id] ?? room.price}
                                          onClick={(e) => e.stopPropagation()}
                                          onChange={(e) => setCustomPrices({...customPrices, [room.id]: parseFloat(e.target.value) || 0})}
                                          className={`w-20 h-8 px-2 rounded-lg text-sm font-bold border transition-all outline-none ${selectedRoomIds.includes(room.id) ? 'bg-white/20 border-white/30 text-white focus:bg-white/30' : 'bg-black/5 border-black/5 focus:bg-white focus:border-primary'}`}
                                        />
                                      </div>
                                      <p className={`text-[10px] ${selectedRoomIds.includes(room.id) ? 'text-white/70' : 'text-black/40'}`}>Total: Rs. {(customPrices[room.id] ?? room.price) * calculateNights(checkIn, checkOut)}</p>
                                    </div>
                                  )}
                              </div>
                            ))}
                          </div>

                        <div className="space-y-4">
                          {selectedRoomIds.length > 0 && (
                            <div className="bg-primary-light rounded-2xl p-4 border border-primary-light">
                              <div className="flex justify-between items-center">
                                <div>
                                  <p className="text-[10px] font-bold uppercase tracking-widest text-primary-text">Selected Summary</p>
                                  <p className="text-sm font-semibold text-primary-text">
                                    {selectedRoomIds.length} {selectedRoomIds.length === 1 ? 'Room' : 'Rooms'} selected
                                  </p>
                                </div>
                                <div className="text-right flex flex-col items-end gap-2">
                                  <div>
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-primary-text">Total Price</p>
                                    <p className="text-xl font-bold text-primary-text">
                                      Rs. {result.rooms
                                        .filter(r => selectedRoomIds.includes(r.id))
                                        .reduce((acc, curr) => acc + ((customPrices[curr.id] ?? curr.price) * calculateNights(checkIn, checkOut)), 0)
                                      }
                                    </p>
                                  </div>
                                  {roomNumber !== '' && (
                                    <button 
                                      onClick={() => {
                                        setRoomNumber('');
                                        // The useEffect will trigger performCheckAvailability
                                        window.scrollTo({ top: 0, behavior: 'smooth' });
                                      }}
                                      className="flex items-center gap-1 px-3 py-1 bg-white/20 hover:bg-white/30 text-primary-text rounded-lg text-[10px] font-bold transition-all border border-white/20"
                                    >
                                      <Plus size={12} /> Add another room
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                          <div className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-wider text-black/40 flex items-center gap-2">
                              <Filter size={14} /> Accommodation Summary
                            </label>
                            <div className="flex flex-col sm:flex-row gap-3">
                              {['AC', 'Non-AC'].map((type) => {
                                const count = selectedRoomIds.filter(id => roomAcTypes[id] === type || (!roomAcTypes[id] && type === 'Non-AC')).length;
                                
                                return (
                                  <div 
                                    key={type}
                                    className={`flex-1 p-3 rounded-xl border transition-all flex flex-col items-center justify-center gap-1 ${count > 0 ? 'bg-primary/10 border-primary text-primary' : 'bg-white border-black/5 text-black/40'}`}
                                  >
                                    <span className="text-[10px] font-bold uppercase">{type}</span>
                                    <span className="text-[8px] opacity-60">{count} Selected</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          <div className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-wider text-black/40 flex items-center gap-2">
                              <Filter size={14} /> Select Plan
                            </label>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              {(['Only Room', 'Room With Breakfast', 'Food Package'] as const).map((p) => (
                                <button
                                  key={p}
                                  onClick={() => setSelectedPlan(p)}
                                  className={`h-12 rounded-xl text-[10px] font-bold border transition-all flex flex-col items-center justify-center gap-1 leading-tight text-center px-1 ${selectedPlan === p ? 'bg-primary text-white border-primary shadow-md' : 'bg-white text-black/60 border-black/5 hover:border-primary'}`}
                                >
                                  {p === 'Only Room' && <Bed size={14} />}
                                  {p === 'Room With Breakfast' && <Coffee size={14} />}
                                  {p === 'Food Package' && <PackageIcon size={14} />}
                                  {p}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <label className="text-xs font-bold uppercase tracking-wider text-black/40 flex items-center gap-2">
                                <FileText size={14} /> Guest GST Number
                              </label>
                              <div className="relative">
                                <input 
                                  type="text" 
                                  placeholder="15-digit GSTIN"
                                  value={guestGST}
                                  onChange={(e) => {
                                    const val = e.target.value.toUpperCase();
                                    setGuestGST(val);
                                    if (val.length === 15) {
                                      fetchGSTDetails(val, 'booking');
                                    }
                                  }}
                                  className="w-full h-12 px-4 rounded-xl bg-white border-primary-light focus:border-primary focus:ring-0 transition-all outline-none shadow-sm"
                                />
                                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
                                  {fetchingGST && (
                                    <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => window.open(`https://services.gst.gov.in/services/searchtp?gstin=${guestGST}`, '_blank')}
                                    className="p-2 hover:bg-black/5 rounded-lg text-black/30 hover:text-primary transition-all"
                                    title="Verify on Official GST Portal"
                                  >
                                    <ExternalLink size={16} />
                                  </button>
                                </div>
                              </div>
                              {fetchingAI && (
                                <p className="text-[10px] text-primary font-medium mt-1 flex items-center gap-1 animate-pulse">
                                  <Sparkles size={10} /> Searching with AI...
                                </p>
                              )}
                              {usingMockGST && (
                                <p className="text-[10px] text-orange-600 font-medium mt-1 animate-pulse">
                                  ⚠️ Using Demo Data. Configure API Key in Settings for real data.
                                </p>
                              )}
                            </div>
                            <div className="space-y-2">
                              <label className="text-xs font-bold uppercase tracking-wider text-black/40 flex items-center gap-2">
                                <MapPin size={14} /> Guest Address
                              </label>
                              <input 
                                type="text" 
                                placeholder="Enter full address"
                                value={guestAddress}
                                onChange={(e) => setGuestAddress(e.target.value)}
                                className="w-full h-12 px-4 rounded-xl bg-white border-primary-light focus:border-primary focus:ring-0 transition-all outline-none shadow-sm"
                              />
                            </div>
                          </div>

                          <label className="text-xs font-bold uppercase tracking-wider text-black/40 flex items-center gap-2">
                            <User size={14} /> Guest Name
                          </label>
                          <input 
                            type="text" 
                            placeholder="Enter guest full name"
                            value={guestName}
                            onChange={(e) => setGuestName(e.target.value)}
                            className="w-full h-14 px-6 rounded-2xl bg-white border-primary-light focus:border-primary focus:ring-0 transition-all outline-none shadow-sm"
                          />

                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <label className="text-xs font-bold uppercase tracking-wider text-black/40 flex items-center gap-2">
                                <Info size={14} /> Email Address
                              </label>
                              <input 
                                type="email" 
                                placeholder="guest@example.com"
                                value={guestEmail}
                                onChange={(e) => setGuestEmail(e.target.value)}
                                className="w-full h-12 px-4 rounded-xl bg-white border-primary-light focus:border-primary focus:ring-0 transition-all outline-none shadow-sm"
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-xs font-bold uppercase tracking-wider text-black/40 flex items-center gap-2">
                                <Info size={14} /> Phone Number
                              </label>
                              <input 
                                type="tel" 
                                placeholder="+1 234 567 890"
                                value={guestPhone}
                                onChange={(e) => setGuestPhone(e.target.value)}
                                className="w-full h-12 px-4 rounded-xl bg-white border-primary-light focus:border-primary focus:ring-0 transition-all outline-none shadow-sm"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <label className="text-xs font-bold uppercase tracking-wider text-black/40 flex items-center gap-2">
                                <Users size={14} /> Adults
                              </label>
                              <input 
                                type="number" 
                                min="1"
                                value={adults}
                                onChange={(e) => setAdults(parseInt(e.target.value) || 1)}
                                className="w-full h-12 px-4 rounded-xl bg-white border-primary-light focus:border-primary focus:ring-0 transition-all outline-none shadow-sm"
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-xs font-bold uppercase tracking-wider text-black/40 flex items-center gap-2">
                                <Users size={14} /> Children
                              </label>
                              <input 
                                type="number" 
                                min="0"
                                value={children}
                                onChange={(e) => setChildren(parseInt(e.target.value) || 0)}
                                className="w-full h-12 px-4 rounded-xl bg-white border-primary-light focus:border-primary focus:ring-0 transition-all outline-none shadow-sm"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <label className="text-xs font-bold uppercase tracking-wider text-black/40 flex items-center gap-2">
                                <CreditCard size={14} /> {hotelSettings.additional_charge_name || 'Additional Charge'} (Rs.)
                              </label>
                              <input 
                                type="number" 
                                min="0"
                                value={dsdaCharge}
                                onChange={(e) => setDsdaCharge(e.target.value)}
                                className="w-full h-12 px-4 rounded-xl bg-white border-primary-light focus:border-primary focus:ring-0 transition-all outline-none shadow-sm"
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-xs font-bold uppercase tracking-wider text-black/40 flex items-center gap-2">
                                <CreditCard size={14} /> Advance Payment (Rs.)
                              </label>
                              <input 
                                type="number" 
                                min="0"
                                value={advancePayment}
                                onChange={(e) => setAdvancePayment(e.target.value)}
                                className="w-full h-12 px-4 rounded-xl bg-white border-primary-light focus:border-primary focus:ring-0 transition-all outline-none shadow-sm"
                              />
                            </div>
                          </div>

                          <button 
                            onClick={() => setShowReview(true)}
                            disabled={!guestName || selectedRoomIds.length === 0 || loading}
                            className="w-full h-14 bg-black text-white rounded-2xl font-semibold hover:bg-black/80 transition-all disabled:opacity-50"
                          >
                            Review Booking Summary
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="py-12 text-center">
                        <div className="w-20 h-20 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-6 text-rose-600">
                          <Calendar size={40} />
                        </div>
                        <p className="text-rose-900 font-medium text-lg">
                          This room is already booked for the selected dates.
                        </p>
                        <p className="text-rose-700/60 mt-2">
                          Please try different dates or another room number.
                        </p>
                      </div>
                    )}
                  </motion.div>
                ) : (bookingSuccess && lastBookingDetails) ? (
                  <motion.div
                    key="success"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-primary rounded-3xl p-12 text-white text-center shadow-xl shadow-primary-light print:p-0 print:shadow-none print:text-black print:bg-white"
                  >
                    <div className="w-24 h-24 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-8 print:hidden">
                      <CheckCircle2 size={48} />
                    </div>
                    <h3 className="text-4xl font-bold mb-4 print:text-2xl print:mb-2">Confirmed Successfully!</h3>
                    <p className="text-white/90 text-xl mb-8 opacity-90 print:text-black print:text-base print:mb-6">
                      Your reservation has been successfully processed and stored in our records.
                    </p>
                    
                    <div className="bg-white/10 rounded-2xl p-8 text-left space-y-6 border border-white/10 print:bg-gray-50 print:border-gray-200 print:text-black">
                      <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-1">
                          <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">Guest Name</p>
                          <p className="font-semibold text-lg">{lastBookingDetails.guestName}</p>
                          <p className="text-xs opacity-60">{lastBookingDetails.guestEmail} • {lastBookingDetails.guestPhone}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">Check-in</p>
                          <p className="font-semibold">{lastBookingDetails.checkIn} • 10:30 AM</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">Check-out</p>
                          <p className="font-semibold">{lastBookingDetails.checkOut} • 09:30 AM</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">Total Days</p>
                          <p className="font-semibold">{calculateNights(lastBookingDetails.checkIn, lastBookingDetails.checkOut)}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">Selected Plan</p>
                          <p className="font-semibold">{lastBookingDetails.selectedPlan}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">Guests</p>
                          <p className="font-semibold">{lastBookingDetails.adults} Adults, {lastBookingDetails.children} Children</p>
                        </div>
                      </div>

                      <div className="pt-6 border-t border-white/10 space-y-4 print:border-gray-200">
                        <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">Reserved Rooms</p>
                        <div className="grid gap-3">
                          {lastBookedRooms.map(room => (
                            <div key={room.id} className="flex items-center justify-between bg-white/5 p-3 rounded-xl border border-white/5 print:bg-white print:border-gray-100">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center font-bold text-xs print:bg-gray-100">
                                  {room.room_number}
                                </div>
                                <div>
                                  <p className="text-sm font-bold">{room.type}</p>
                                  <p className="text-[10px] opacity-60">Rs. {lastBookingDetails.bookedPrices[room.id] ?? room.price} / day</p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-sm font-bold">Rs. {(lastBookingDetails.bookedPrices[room.id] ?? room.price) * calculateNights(lastBookingDetails.checkIn, lastBookingDetails.checkOut)}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      
                      <div className="pt-6 border-t border-white/10 flex justify-between items-end print:border-gray-200">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">Total Amount</p>
                          <p className="text-3xl font-bold">
                            Rs. {lastBookedRooms.reduce((acc, curr) => acc + ((lastBookingDetails.bookedPrices[curr.id] ?? curr.price) * calculateNights(lastBookingDetails.checkIn, lastBookingDetails.checkOut)), 0) + (lastBookingDetails.dsdaCharge || 0)}
                          </p>
                          {(lastBookingDetails.dsdaCharge || 0) > 0 && (
                            <p className="text-[10px] opacity-60 mt-1">Includes Rs. {lastBookingDetails.dsdaCharge} {hotelSettings.additional_charge_name || 'Additional Charge'}</p>
                          )}
                          {(lastBookingDetails.advancePayment || 0) > 0 && (
                            <div className="mt-2 space-y-1">
                              <p className="text-[10px] text-emerald-300 font-bold">Advance Paid: Rs. {lastBookingDetails.advancePayment}</p>
                              <p className="text-[10px] opacity-60">Balance: Rs. {
                                (lastBookedRooms.reduce((acc, curr) => acc + ((lastBookingDetails.bookedPrices[curr.id] ?? curr.price) * calculateNights(lastBookingDetails.checkIn, lastBookingDetails.checkOut)), 0) + (lastBookingDetails.dsdaCharge || 0)) - (lastBookingDetails.advancePayment || 0)
                              }</p>
                            </div>
                          )}
                        </div>
                        <div className="text-right opacity-60 text-[10px]">
                          <p>Booking ID: #{lastBookingDetails.bookingId}</p>
                          <p>Date: {formatDateDDMMYYYY(new Date())}</p>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-10 print:hidden">
                      <div className="grid grid-cols-2 gap-2">
                        <button 
                          onClick={() => setBookingSuccess(false)}
                          className="h-14 bg-white text-primary rounded-2xl font-bold hover:bg-primary-light transition-colors"
                        >
                          New Booking
                        </button>
                        <button 
                          onClick={generateAdvanceReceiptPDF}
                          className="h-14 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2"
                        >
                          <CreditCard size={20} />
                          Advance Receipt
                        </button>
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        <button 
                          onClick={() => window.print()}
                          className="h-14 bg-primary-hover text-white rounded-2xl font-bold hover:bg-primary-hover/90 transition-colors flex items-center justify-center gap-2"
                          title="Print Receipt"
                        >
                          <Printer size={20} />
                        </button>
                        <button 
                          onClick={generatePDFReceipt}
                          className="h-14 bg-primary-hover text-white rounded-2xl font-bold hover:bg-primary-hover/90 transition-colors flex items-center justify-center gap-2"
                          title="Download PDF"
                        >
                          <FileText size={20} />
                        </button>
                        <button 
                          onClick={downloadReceipt}
                          className="h-14 bg-primary-hover text-white rounded-2xl font-bold hover:bg-primary-hover/90 transition-colors flex items-center justify-center gap-2"
                          title="Download TXT"
                        >
                          <Download size={20} />
                        </button>
                        <button 
                          onClick={shareReceipt}
                          className="h-14 bg-primary-hover text-white rounded-2xl font-bold hover:bg-primary-hover/90 transition-colors flex items-center justify-center gap-2"
                          title="Share Receipt"
                        >
                          <Share2 size={20} />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center p-12 bg-black/[0.02] rounded-3xl border border-dashed border-black/10">
                    <div className="w-20 h-20 bg-white rounded-2xl shadow-sm flex items-center justify-center mb-6 text-black/20">
                      <Search size={40} />
                    </div>
                    <h3 className="text-xl font-semibold text-black/40">Ready to Search</h3>
                    <p className="text-black/30 mt-2 max-w-xs">
                      Enter your stay details on the left to check real-time room availability.
                    </p>
                  </div>
                )}
              </AnimatePresence>
            </div>
          </div>
        ) : activeView === 'bookings' ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-8"
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div>
                <h2 className="text-3xl font-bold tracking-tight">Booking Records</h2>
                <p className="text-black/40 mt-1">Manage and track all guest reservations.</p>
              </div>
              
              <div className="flex flex-wrap items-center gap-4">
                <button 
                  onClick={retrieveDeletedBookings}
                  disabled={isRetrieving}
                  className="h-12 px-6 bg-emerald-50 text-emerald-600 rounded-xl font-bold hover:bg-emerald-100 transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  <RefreshCw size={18} className={isRetrieving ? 'animate-spin' : ''} />
                  {isRetrieving ? 'Retrieving...' : 'Retrieve Deleted'}
                </button>
                <div className="flex items-center gap-2 bg-white p-1 rounded-xl border border-black/5 shadow-sm">
                  <div className="px-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-black/40">From</p>
                    <input 
                      type="date" 
                      value={filterStartDate}
                      onChange={(e) => setFilterStartDate(e.target.value)}
                      className="text-xs bg-transparent border-none focus:ring-0 p-0"
                    />
                  </div>
                  <div className="w-px h-8 bg-black/5" />
                  <div className="px-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-black/40">To</p>
                    <input 
                      type="date" 
                      value={filterEndDate}
                      onChange={(e) => setFilterEndDate(e.target.value)}
                      className="text-xs bg-transparent border-none focus:ring-0 p-0"
                    />
                  </div>
                </div>

                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-black/30" size={18} />
                  <input 
                    type="text" 
                    placeholder="Search guest or room..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-12 pl-12 pr-6 rounded-xl bg-white border border-black/5 focus:border-primary focus:ring-0 transition-all outline-none w-64 shadow-sm"
                  />
                </div>
                
                <div className="flex bg-white p-1 rounded-xl border border-black/5 shadow-sm">
                  {(['all', 'upcoming', 'past'] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => setFilterType(type)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all capitalize ${filterType === type ? 'bg-primary text-white shadow-sm' : 'text-black/40 hover:text-black'}`}
                    >
                      {type}
                    </button>
                  ))}
                </div>

                <div className="flex bg-white p-1 rounded-xl border border-black/5 shadow-sm">
                  {(['all', 'confirmed', 'cancelled'] as const).map((status) => (
                    <button
                      key={status}
                      onClick={() => setFilterStatus(status)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all capitalize ${filterStatus === status ? 'bg-primary text-white shadow-sm' : 'text-black/40 hover:text-black'}`}
                    >
                      {status}
                    </button>
                  ))}
                </div>

                <button 
                  onClick={resetFilters}
                  className="h-12 px-4 rounded-xl bg-white border border-black/5 text-black/40 hover:text-rose-600 hover:border-rose-100 transition-all text-sm font-medium flex items-center gap-2 shadow-sm"
                >
                  <XCircle size={16} />
                  Reset
                </button>
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-black/5 shadow-sm overflow-hidden">
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-black/[0.02] border-b border-black/5">
                      <th className="px-8 py-5 text-[10px] font-bold uppercase tracking-widest text-black/40">Guest</th>
                      <th className="px-8 py-5 text-[10px] font-bold uppercase tracking-widest text-black/40">Room</th>
                      <th className="px-8 py-5 text-[10px] font-bold uppercase tracking-widest text-black/40">Check-in</th>
                      <th className="px-8 py-5 text-[10px] font-bold uppercase tracking-widest text-black/40">Check-out</th>
                      <th className="px-8 py-5 text-[10px] font-bold uppercase tracking-widest text-black/40">Plan</th>
                      <th className="px-8 py-5 text-[10px] font-bold uppercase tracking-widest text-black/40">Status</th>
                      <th className="px-8 py-5 text-[10px] font-bold uppercase tracking-widest text-black/40">Payment Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5">
                    {allBookings
                      .filter(b => {
                        const matchesSearch = b.guest_name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                                            b.room_number.includes(searchQuery);
                        
                        const bookingDate = new Date(b.check_in);
                        const isUpcoming = bookingDate >= new Date();
                        
                        let matchesType = true;
                        if (filterType === 'upcoming') matchesType = isUpcoming;
                        if (filterType === 'past') matchesType = !isUpcoming;

                        let matchesStatus = true;
                        if (filterStatus !== 'all') matchesStatus = b.status === filterStatus;

                        let matchesDateRange = true;
                        if (filterStartDate) matchesDateRange = matchesDateRange && bookingDate >= new Date(filterStartDate);
                        if (filterEndDate) matchesDateRange = matchesDateRange && bookingDate <= new Date(filterEndDate);

                        return matchesSearch && matchesType && matchesStatus && matchesDateRange;
                      })
                      .map((booking) => {
                        const isUpcoming = new Date(booking.check_in) >= new Date();
                        const nights = calculateNights(booking.check_in, booking.check_out);
                        return (
                          <motion.tr 
                            layout
                            key={booking.id} 
                            className={`hover:bg-black/[0.01] transition-colors group ${booking.status === 'cancelled' ? 'opacity-50 grayscale' : ''}`}
                          >
                            <td className="px-8 py-6">
                              <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs ${booking.status === 'cancelled' ? 'bg-black/10 text-black/40' : 'bg-primary-light text-primary-text'}`}>
                                  {booking.guest_name.charAt(0)}
                                </div>
                                <div>
                                  <p className="font-semibold text-sm">{booking.guest_name}</p>
                                  <div className="flex flex-col gap-0.5 text-[10px] text-black/40">
                                    <span className="flex items-center gap-1"><Phone size={10} /> {booking.guest_phone}</span>
                                    <div className="flex items-center gap-2">
                                      <span>ID: #LS-{booking.id + 10000}</span>
                                      <span>•</span>
                                      <span className="flex items-center gap-0.5"><Users size={10} /> {booking.adults}A, {booking.children}C</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-8 py-6">
                              <div className="flex flex-col gap-1">
                                <span className="font-bold text-sm">#{booking.room_number}</span>
                                <span className="text-[10px] text-black/40 uppercase tracking-widest font-bold">{booking.room_type}</span>
                              </div>
                            </td>
                            <td className="px-8 py-6">
                              <p className="text-sm text-black/60">{booking.check_in}</p>
                              <p className="text-[10px] text-black/30">{booking.check_in_time || '10:30 AM'}</p>
                            </td>
                            <td className="px-8 py-6">
                              <p className="text-sm text-black/60">{booking.check_out}</p>
                              <p className="text-[10px] text-black/30">{booking.check_out_time || '09:30 AM'}</p>
                            </td>
                            <td className="px-8 py-6">
                              <span className="text-xs font-medium px-2 py-1 bg-black/5 rounded text-black/60">
                                {booking.plan || 'Only Room'}
                              </span>
                            </td>
                            <td className="px-8 py-6">
                              <div className="flex flex-col gap-2">
                                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                  booking.status === 'cancelled' 
                                    ? 'bg-rose-100 text-rose-700' 
                                    : isUpcoming 
                                      ? 'bg-indigo-100 text-indigo-700' 
                                      : 'bg-emerald-100 text-emerald-700'
                                }`}>
                                  {booking.status === 'cancelled' ? <XCircle size={12} /> : isUpcoming ? <CalendarDays size={12} /> : <CheckCircle2 size={12} />}
                                  {booking.status === 'cancelled' ? 'Cancelled' : isUpcoming ? 'Upcoming' : 'Confirmed'}
                                </span>
                                
                                {booking.status === 'confirmed' && (
                                  <div className="flex flex-col gap-1">
                                    <button 
                                      onClick={() => handleCancelBooking(booking.id)}
                                      className="text-[10px] text-rose-600 font-bold hover:underline text-left px-3 flex items-center gap-1"
                                    >
                                      <X size={10} /> Cancel This Room
                                    </button>
                                    <button 
                                      onClick={() => handleCancelGroupBooking(booking.booking_id)}
                                      className="text-[10px] text-rose-800 font-bold hover:underline text-left px-3 flex items-center gap-1"
                                      disabled={!booking.booking_id}
                                      title={!booking.booking_id ? "Group cancellation not available for old bookings" : ""}
                                    >
                                      <Trash2 size={10} /> Cancel Entire Group
                                    </button>
                                    <button 
                                      onClick={() => handleEditBooking(booking)}
                                      className="text-[10px] text-primary font-bold hover:underline text-left px-3 flex items-center gap-1"
                                    >
                                      <Settings size={10} /> Change Details
                                    </button>
                                    <button 
                                      onClick={() => downloadReceiptForBooking(booking)}
                                      className="text-[10px] text-emerald-600 font-bold hover:underline text-left px-3 flex items-center gap-1"
                                    >
                                      <Download size={10} /> Download Receipt
                                    </button>
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="px-8 py-6">
                              <div className="flex flex-col gap-1">
                                <p className="font-bold text-sm">Total: Rs. {booking.room_price * nights + (booking.dsda_charge || 0)}</p>
                                <p className="text-[10px] text-emerald-600 font-bold">Paid: Rs. {booking.advance_payment || 0}</p>
                                <p className="text-[10px] text-rose-600 font-bold">Due: Rs. {(booking.room_price * nights + (booking.dsda_charge || 0)) - (booking.advance_payment || 0)}</p>
                                <p className="text-[10px] text-black/40">{nights} days</p>
                              </div>
                            </td>
                          </motion.tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View */}
              <div className="md:hidden divide-y divide-black/5">
                {allBookings
                  .filter(b => {
                    const matchesSearch = b.guest_name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                                        b.room_number.includes(searchQuery);
                    
                    const bookingDate = new Date(b.check_in);
                    const isUpcoming = bookingDate >= new Date();
                    
                    let matchesType = true;
                    if (filterType === 'upcoming') matchesType = isUpcoming;
                    if (filterType === 'past') matchesType = !isUpcoming;

                    let matchesStatus = true;
                    if (filterStatus !== 'all') matchesStatus = b.status === filterStatus;

                    let matchesDateRange = true;
                    if (filterStartDate) matchesDateRange = matchesDateRange && bookingDate >= new Date(filterStartDate);
                    if (filterEndDate) matchesDateRange = matchesDateRange && bookingDate <= new Date(filterEndDate);

                    return matchesSearch && matchesType && matchesStatus && matchesDateRange;
                  })
                  .map((booking) => {
                    const isUpcoming = new Date(booking.check_in) >= new Date();
                    const nights = calculateNights(booking.check_in, booking.check_out);
                    return (
                      <div key={booking.id} className={`p-6 space-y-4 ${booking.status === 'cancelled' ? 'opacity-50 grayscale' : ''}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs ${booking.status === 'cancelled' ? 'bg-black/10 text-black/40' : 'bg-primary-light text-primary-text'}`}>
                              {booking.guest_name.charAt(0)}
                            </div>
                            <div>
                              <p className="font-bold text-sm">{booking.guest_name}</p>
                              <p className="text-[10px] text-black/40">ID: #LS-{booking.id + 10000}</p>
                            </div>
                          </div>
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            booking.status === 'cancelled' 
                              ? 'bg-rose-100 text-rose-700' 
                              : isUpcoming 
                                ? 'bg-indigo-100 text-indigo-700' 
                                : 'bg-emerald-100 text-emerald-700'
                          }`}>
                            {booking.status === 'cancelled' ? 'Cancelled' : isUpcoming ? 'Upcoming' : 'Confirmed'}
                          </span>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4 py-4 border-y border-black/5">
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-black/30 mb-1">Type</p>
                            <p className="text-sm font-bold">{booking.room_type}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-black/30 mb-1">Total</p>
                            <p className="text-sm font-bold text-primary">Rs. {booking.room_price * nights}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-black/30 mb-1">Check-in</p>
                            <p className="text-sm">{booking.check_in}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-black/30 mb-1">Check-out</p>
                            <p className="text-sm">{booking.check_out}</p>
                          </div>
                        </div>
                        
                        <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-black/40">
                          <span className="flex items-center gap-1"><Users size={12} /> {booking.adults}A, {booking.children}C</span>
                          <span>{nights} days • {booking.plan || 'Only Room'}</span>
                        </div>
                        
                        {booking.status === 'confirmed' && (
                          <div className="flex flex-wrap gap-2 pt-2">
                            <button 
                              onClick={() => handleCancelBooking(booking.id)}
                              className="px-3 py-2 bg-rose-50 text-rose-600 rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-rose-100 transition-all"
                            >
                              Cancel Room
                            </button>
                            <button 
                              onClick={() => handleCancelGroupBooking(booking.booking_id)}
                              className="px-3 py-2 bg-rose-100 text-rose-800 rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-rose-200 transition-all"
                              disabled={!booking.booking_id}
                            >
                              Cancel Group
                            </button>
                            <button 
                              onClick={() => handleEditBooking(booking)}
                              className="px-3 py-2 bg-primary-light text-primary-text rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-primary-light/80 transition-all"
                            >
                              Edit Details
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
              {allBookings.length === 0 && (
                <div className="py-20 text-center">
                  <div className="w-16 h-16 bg-black/5 rounded-full flex items-center justify-center mx-auto mb-4 text-black/20">
                    <List size={32} />
                  </div>
                  <p className="text-black/40 font-medium">No booking records found.</p>
                </div>
              )}
            </div>
          </motion.div>
        ) : activeView === 'profiles' ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-8"
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div>
                <h2 className="text-3xl font-bold tracking-tight">Guest Profiles</h2>
                <p className="text-black/40 mt-1">Manage guest history and loyalty.</p>
              </div>
            </div>

            <div className="grid lg:grid-cols-12 gap-8">
              <div className="lg:col-span-4 space-y-4">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-black/30" size={18} />
                  <input 
                    type="text" 
                    placeholder="Search guests..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full h-12 pl-12 pr-6 rounded-xl bg-white border border-black/5 focus:border-primary focus:ring-0 transition-all outline-none shadow-sm"
                  />
                </div>
                <div className="bg-white rounded-3xl border border-black/5 shadow-sm overflow-hidden divide-y divide-black/5">
                  {guests
                    .filter(g => g.guest_name.toLowerCase().includes(searchQuery.toLowerCase()))
                    .map(guest => (
                      <button
                        key={guest.guest_name}
                        onClick={() => {
                          setSelectedGuest(guest.guest_name);
                          fetchGuestBookings(guest.guest_name);
                        }}
                        className={`w-full p-6 text-left hover:bg-black/[0.01] transition-colors flex items-center justify-between group ${selectedGuest === guest.guest_name ? 'bg-primary-light/50' : ''}`}
                      >
                        <div className="flex items-center gap-4">
                          <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm ${selectedGuest === guest.guest_name ? 'bg-primary text-white' : 'bg-primary-light text-primary-text'}`}>
                            {guest.guest_name.charAt(0)}
                          </div>
                          <div>
                            <p className="font-bold">{guest.guest_name}</p>
                            <div className="flex flex-col gap-0.5 text-[10px] text-black/40">
                              <span className="flex items-center gap-1"><Phone size={10} /> {guest.guest_phone}</span>
                              <span className="flex items-center gap-1"><Mail size={10} /> {guest.guest_email}</span>
                              <p>{guest.booking_count} {guest.booking_count === 1 ? 'Booking' : 'Bookings'}</p>
                            </div>
                          </div>
                        </div>
                        <ArrowRight size={16} className={`text-black/20 group-hover:text-primary transition-all ${selectedGuest === guest.guest_name ? 'translate-x-0 opacity-100' : '-translate-x-2 opacity-0'}`} />
                      </button>
                    ))}
                  {guests.length === 0 && (
                    <div className="p-12 text-center text-black/30">
                      <User size={32} className="mx-auto mb-2 opacity-20" />
                      <p className="text-sm">No guests found.</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="lg:col-span-8">
                <AnimatePresence mode="wait">
                  {selectedGuest ? (
                    <motion.div
                      key={selectedGuest}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="space-y-6"
                    >
                      <div className="bg-white rounded-3xl p-8 border border-black/5 shadow-sm flex items-center justify-between">
                        <div className="flex items-center gap-6">
                          <div className="w-20 h-20 rounded-3xl bg-primary flex items-center justify-center text-white text-3xl font-bold">
                            {selectedGuest.charAt(0)}
                          </div>
                          <div>
                            <h3 className="text-2xl font-bold">{selectedGuest}</h3>
                            <p className="text-black/40">Member since {guestBookings.length > 0 ? new Date(guestBookings[guestBookings.length - 1].check_in).getFullYear() : 'N/A'}</p>
                          </div>
                        </div>
                        <button 
                          onClick={() => {
                            setGuestName(selectedGuest);
                            setActiveView('availability');
                          }}
                          className="h-12 px-6 bg-black text-white rounded-xl font-bold hover:bg-black/80 transition-all flex items-center gap-2"
                        >
                          <Plus size={18} />
                          New Booking
                        </button>
                      </div>

                      <div className="bg-white rounded-3xl border border-black/5 shadow-sm overflow-hidden">
                        <div className="px-8 py-6 border-b border-black/5 bg-black/[0.01]">
                          <h4 className="font-bold">Booking History</h4>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left">
                            <thead>
                              <tr className="border-b border-black/5">
                                <th className="px-8 py-4 text-[10px] font-bold uppercase tracking-widest text-black/40">Room</th>
                                <th className="px-8 py-4 text-[10px] font-bold uppercase tracking-widest text-black/40">Dates</th>
                                <th className="px-8 py-4 text-[10px] font-bold uppercase tracking-widest text-black/40">Status</th>
                                <th className="px-8 py-4 text-[10px] font-bold uppercase tracking-widest text-black/40">Total</th>
                                <th className="px-8 py-4 text-[10px] font-bold uppercase tracking-widest text-black/40">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-black/5">
                              {guestBookings.map(booking => {
                                const nights = calculateNights(booking.check_in, booking.check_out);
                                return (
                                  <tr key={booking.id} className="hover:bg-black/[0.01]">
                                    <td className="px-8 py-4">
                                      <p className="font-bold text-sm">#{booking.room_number}</p>
                                      <div className="flex items-center gap-1 text-[10px] text-black/40">
                                        <span>{booking.room_type}</span>
                                        <span>•</span>
                                        <span className="flex items-center gap-0.5"><Users size={10} /> {booking.adults}A, {booking.children}C</span>
                                      </div>
                                    </td>
                                    <td className="px-8 py-4">
                                      <p className="text-sm font-medium">{booking.check_in} - {booking.check_out}</p>
                                      <p className="text-[10px] text-black/40">{nights} days</p>
                                    </td>
                                    <td className="px-8 py-4">
                                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${booking.status === 'cancelled' ? 'bg-rose-100 text-rose-700' : 'bg-primary-light text-primary-text'}`}>
                                        {booking.status}
                                      </span>
                                    </td>
                                    <td className="px-8 py-4 font-bold text-sm">Rs. {booking.room_price * nights}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </motion.div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center p-12 bg-black/[0.02] rounded-3xl border border-dashed border-black/10 min-h-[400px]">
                      <div className="w-20 h-20 bg-white rounded-2xl shadow-sm flex items-center justify-center mb-6 text-black/20">
                        <User size={40} />
                      </div>
                      <h3 className="text-xl font-semibold text-black/40">Select a Guest</h3>
                      <p className="text-black/30 mt-2 max-w-xs">
                        Select a guest from the left to view their detailed booking history and manage their profile.
                      </p>
                    </div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        ) : activeView === 'billing' ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-8"
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div>
                <h2 className="text-3xl font-bold tracking-tight">Billing Center</h2>
                <p className="text-black/40 mt-1">Generate Normal and GST bills for your guests.</p>
              </div>
              
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setShowManualBill(true)}
                  className="h-12 px-6 bg-primary text-white rounded-xl font-bold hover:bg-primary-hover transition-all flex items-center gap-2 shadow-lg shadow-primary/20"
                >
                  <Plus size={20} />
                  Create Manual Bill
                </button>
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-black/30" size={18} />
                  <input 
                    type="text" 
                    placeholder="Search guest or room..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-12 pl-12 pr-6 rounded-xl bg-white border border-black/5 focus:border-primary focus:ring-0 transition-all outline-none w-64 shadow-sm"
                  />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-3xl shadow-sm border border-black/5 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-black/5">
                      <th className="px-8 py-4 text-[10px] font-bold uppercase tracking-widest text-black/40">Guest</th>
                      <th className="px-8 py-4 text-[10px] font-bold uppercase tracking-widest text-black/40">Room</th>
                      <th className="px-8 py-4 text-[10px] font-bold uppercase tracking-widest text-black/40">Stay Dates</th>
                      <th className="px-8 py-4 text-[10px] font-bold uppercase tracking-widest text-black/40">Base Price</th>
                      <th className="px-8 py-4 text-[10px] font-bold uppercase tracking-widest text-black/40">GST</th>
                      <th className="px-8 py-4 text-[10px] font-bold uppercase tracking-widest text-black/40 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5">
                    {allBookings
                      .filter(b => 
                        !b.is_billed && b.status === 'confirmed' && (
                          b.guest_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          b.room_number.toLowerCase().includes(searchQuery.toLowerCase())
                        )
                      )
                      .sort((a, b) => new Date(b.check_in).getTime() - new Date(a.check_in).getTime())
                      .map(booking => {
                        const nights = calculateNights(booking.check_in, booking.check_out);
                        return (
                          <tr key={booking.id} className="hover:bg-black/[0.01]">
                            <td className="px-8 py-4">
                              <p className="font-bold text-sm">{booking.guest_name}</p>
                              <p className="text-[10px] text-black/40">{booking.guest_phone}</p>
                            </td>
                            <td className="px-8 py-4">
                              <p className="font-bold text-sm">#{booking.room_number}</p>
                              <p className="text-[10px] text-black/40">{booking.room_type}</p>
                            </td>
                            <td className="px-8 py-4">
                              <p className="text-sm font-medium">{formatDateDDMMYYYY(booking.check_in)} - {formatDateDDMMYYYY(booking.check_out)}</p>
                              <p className="text-[10px] text-black/40">{nights} days</p>
                            </td>
                            <td className="px-8 py-4">
                              <p className="text-sm font-medium">Rs. {booking.room_price * nights}</p>
                            </td>
                            <td className="px-8 py-4">
                              <p className="text-sm font-medium">Rs. {((booking.room_price * nights) * (booking.room_price >= 7500 ? 0.18 : booking.room_price >= 1000 ? 0.05 : 0)).toFixed(2)}</p>
                            </td>
                            <td className="px-8 py-4">
                              <div className="flex items-center justify-end gap-6">
                                <div className="flex items-center gap-2">
                                  <input 
                                    type="checkbox"
                                    id={`dsda-${booking.id}`}
                                    checked={includeDsdaMap[booking.id] ?? true}
                                    onChange={(e) => setIncludeDsdaMap({...includeDsdaMap, [booking.id]: e.target.checked})}
                                    className="w-4 h-4 rounded border-black/10 text-primary focus:ring-primary"
                                  />
                                  <label htmlFor={`dsda-${booking.id}`} className="text-[10px] font-bold uppercase tracking-widest text-black/30">Inc. {hotelSettings.additional_charge_name || 'DSDA'}</label>
                                </div>
                                <div className="flex items-center gap-3">
                                  <button 
                                    onClick={() => downloadReceiptForBooking(booking, includeDsdaMap[booking.id] ?? true)}
                                    className="px-4 py-2 bg-black/5 text-black/60 rounded-lg text-xs font-bold hover:bg-black/10 transition-all flex items-center gap-2"
                                  >
                                    <Printer size={14} />
                                    Normal Bill
                                  </button>
                                  <button 
                                    onClick={() => generateGSTBillPDF(booking, includeDsdaMap[booking.id] ?? true)}
                                    className="px-4 py-2 bg-primary-light text-primary-text rounded-lg text-xs font-bold hover:bg-primary-light/80 transition-all flex items-center gap-2"
                                  >
                                    <FileText size={14} />
                                    GST Bill
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        ) : activeView === 'all_bills' ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-8"
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div>
                <h2 className="text-3xl font-bold tracking-tight">All Bills History</h2>
                <p className="text-black/40 mt-1">View and manage all generated bills and booking history.</p>
              </div>
              
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2 bg-white px-4 h-12 rounded-xl border border-black/5 shadow-sm">
                  <Calendar size={18} className="text-black/30" />
                  <input 
                    type="month" 
                    value={selectedBillMonth}
                    onChange={(e) => setSelectedBillMonth(e.target.value)}
                    className="bg-transparent border-none outline-none text-sm font-bold"
                  />
                </div>

                <button 
                  onClick={() => generateMonthlyReportPDF(selectedBillMonth)}
                  className="h-12 px-6 bg-primary/10 text-primary rounded-xl font-bold hover:bg-primary/20 transition-all flex items-center gap-2"
                >
                  <Download size={18} />
                  PDF Report
                </button>

                <button 
                  onClick={() => generateMonthlyExcelReport(selectedBillMonth)}
                  className="h-12 px-6 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all flex items-center gap-2 shadow-lg shadow-emerald-600/20"
                >
                  <FileText size={18} />
                  Excel Report
                </button>

                <button 
                  onClick={retrieveDeletedBookings}
                  disabled={isRetrieving}
                  className="h-12 px-6 bg-blue-50 text-blue-600 rounded-xl font-bold hover:bg-blue-100 transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  <RefreshCw size={18} className={isRetrieving ? 'animate-spin' : ''} />
                  {isRetrieving ? 'Retrieving...' : 'Retrieve Deleted'}
                </button>

                <button 
                  onClick={clearAllBills}
                  className="h-12 px-6 bg-rose-50 text-rose-600 rounded-xl font-bold hover:bg-rose-100 transition-all flex items-center gap-2"
                >
                  <Trash2 size={18} />
                  Clear History
                </button>

                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-black/30" size={18} />
                  <input 
                    type="text" 
                    placeholder="Search bills..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-12 pl-12 pr-6 rounded-xl bg-white border border-black/5 focus:border-primary focus:ring-0 transition-all outline-none w-64 shadow-sm"
                  />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-3xl shadow-sm border border-black/5 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-black/5">
                      <th className="px-8 py-4 text-[10px] font-bold uppercase tracking-widest text-black/40">Invoice ID</th>
                      <th className="px-8 py-4 text-[10px] font-bold uppercase tracking-widest text-black/40">Guest</th>
                      <th className="px-8 py-4 text-[10px] font-bold uppercase tracking-widest text-black/40">Room(s)</th>
                      <th className="px-8 py-4 text-[10px] font-bold uppercase tracking-widest text-black/40">Stay Dates</th>
                      <th className="px-8 py-4 text-[10px] font-bold uppercase tracking-widest text-black/40 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5">
                    {allBills
                      .filter(b => {
                        const matchesSearch = b.guest_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          b.invoice_id.toLowerCase().includes(searchQuery.toLowerCase());
                        
                        const matchesMonth = b.check_in.startsWith(selectedBillMonth);
                        
                        return matchesSearch && matchesMonth;
                      })
                      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                      .map(bill => {
                        const rooms = JSON.parse(bill.rooms_data || '[]');
                        return (
                          <tr key={bill.id} className="hover:bg-black/[0.01]">
                            <td className="px-8 py-4">
                              <p className="font-mono text-xs font-bold text-primary">{bill.invoice_id}</p>
                            </td>
                            <td className="px-8 py-4">
                              <p className="font-bold text-sm">{bill.guest_name}</p>
                              <p className="text-[10px] text-black/40">{bill.guest_phone}</p>
                            </td>
                            <td className="px-8 py-4">
                              <p className="font-bold text-sm">{rooms.map((r: any) => `#${r.room_number}`).join(', ')}</p>
                              <p className="text-[10px] text-black/40">{bill.bill_type} Bill</p>
                            </td>
                            <td className="px-8 py-4">
                              <p className="text-sm font-medium">{formatDateDDMMYYYY(bill.check_in)} - {formatDateDDMMYYYY(bill.check_out)}</p>
                              <p className="text-[10px] text-black/40">Total: Rs. {bill.total_amount}</p>
                            </td>
                            <td className="px-8 py-4">
                              <div className="flex items-center justify-end gap-3">
                                <button 
                                  onClick={() => downloadBillFromHistory(bill)}
                                  className="p-2 hover:bg-primary/10 rounded-lg text-primary hover:text-primary-hover transition-all"
                                  title="Download PDF"
                                >
                                  <Download size={16} />
                                </button>
                                <button 
                                  onClick={() => deleteBill(bill.id)}
                                  className="p-2 hover:bg-rose-50 rounded-lg text-rose-400 hover:text-rose-600 transition-all"
                                  title="Delete Bill"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        ) : activeView === 'settings' ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-8"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-3xl font-bold tracking-tight">System Settings</h2>
                <p className="text-black/40 mt-1">Configure hotel information, rooms, and pricing.</p>
              </div>
            </div>

            <div className="grid lg:grid-cols-3 gap-8">
              <div className="lg:col-span-1 space-y-8">
                <div className="bg-white rounded-3xl p-8 shadow-sm border border-black/5">
                  <h3 className="text-xl font-semibold mb-6 flex items-center gap-2">
                    <Settings className="text-primary" size={20} />
                    Hotel Information
                  </h3>
                  <form onSubmit={handleUpdateSettings} className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-black/40">Hotel Name</label>
                      <input 
                        required
                        type="text"
                        value={hotelSettings.hotel_name || ''}
                        onChange={(e) => setHotelSettings({...hotelSettings, hotel_name: e.target.value})}
                        className="w-full h-12 px-4 rounded-xl bg-black/5 border-transparent focus:bg-white focus:border-primary focus:ring-0 transition-all outline-none"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-black/40">Hotel Address</label>
                      <input 
                        required
                        type="text"
                        value={hotelSettings.hotel_address || ''}
                        onChange={(e) => setHotelSettings({...hotelSettings, hotel_address: e.target.value})}
                        className="w-full h-12 px-4 rounded-xl bg-black/5 border-transparent focus:bg-white focus:border-primary focus:ring-0 transition-all outline-none"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-black/40">Contact Info</label>
                      <input 
                        required
                        type="text"
                        value={hotelSettings.contact_info || ''}
                        onChange={(e) => setHotelSettings({...hotelSettings, contact_info: e.target.value})}
                        className="w-full h-12 px-4 rounded-xl bg-black/5 border-transparent focus:bg-white focus:border-primary focus:ring-0 transition-all outline-none"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-black/40">Color Theme</label>
                      <div className="grid grid-cols-5 gap-2">
                        {[
                          { id: 'emerald', color: '#059669' },
                          { id: 'indigo', color: '#4f46e5' },
                          { id: 'rose', color: '#e11d48' },
                          { id: 'amber', color: '#d97706' },
                          { id: 'slate', color: '#475569' }
                        ].map(t => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => setHotelSettings({...hotelSettings, theme: t.id})}
                            className={`h-10 rounded-lg border-2 transition-all flex items-center justify-center ${hotelSettings.theme === t.id ? 'border-black' : 'border-transparent'}`}
                            style={{ backgroundColor: t.color }}
                            title={t.id}
                          >
                            {hotelSettings.theme === t.id && <CheckCircle2 size={16} className="text-white" />}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-black/40">Charge Name</label>
                        <input 
                          type="text"
                          value={hotelSettings.additional_charge_name || 'DSDA Charge'}
                          onChange={(e) => setHotelSettings({...hotelSettings, additional_charge_name: e.target.value})}
                          className="w-full h-12 px-4 rounded-xl bg-black/5 border-transparent focus:bg-white focus:border-primary focus:ring-0 transition-all outline-none"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-black/40">Charge Amount (Rs.)</label>
                        <input 
                          type="number"
                          value={hotelSettings.dsda_charge || '0'}
                          onChange={(e) => setHotelSettings({...hotelSettings, dsda_charge: e.target.value})}
                          className="w-full h-12 px-4 rounded-xl bg-black/5 border-transparent focus:bg-white focus:border-primary focus:ring-0 transition-all outline-none"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-black/40">GST Number</label>
                        <input 
                          type="text"
                          placeholder="Enter GSTIN"
                          value={hotelSettings.gst_number || ''}
                          onChange={(e) => setHotelSettings({...hotelSettings, gst_number: e.target.value})}
                          className="w-full h-12 px-4 rounded-xl bg-black/5 border-transparent focus:bg-white focus:border-primary focus:ring-0 transition-all outline-none"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-black/40">State Code (2 Digits)</label>
                        <input 
                          type="text"
                          maxLength={2}
                          placeholder="e.g. 19"
                          value={hotelSettings.state_code || ''}
                          onChange={(e) => setHotelSettings({...hotelSettings, state_code: e.target.value})}
                          className="w-full h-12 px-4 rounded-xl bg-black/5 border-transparent focus:bg-white focus:border-primary focus:ring-0 transition-all outline-none"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-black/40">Hotel Logo</label>
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-black/5 rounded-xl flex items-center justify-center overflow-hidden border border-black/5">
                          {hotelSettings.logo_url ? (
                            <img src={hotelSettings.logo_url} alt="Logo" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            <Hotel size={20} className="text-black/20" />
                          )}
                        </div>
                        <input 
                          type="file" 
                          accept="image/*"
                          onChange={handleLogoUpload}
                          className="text-[10px] text-black/40 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-[10px] file:font-bold file:bg-primary-light file:text-primary-text hover:file:bg-primary-light/80 cursor-pointer"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-black/40">Authorized Signature</label>
                      <div className="flex items-center gap-4">
                        <div className="w-24 h-12 bg-black/5 rounded-xl flex items-center justify-center overflow-hidden border border-black/5">
                          {hotelSettings.signature_url ? (
                            <img src={hotelSettings.signature_url} alt="Signature" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                          ) : (
                            <FileText size={20} className="text-black/20" />
                          )}
                        </div>
                        <input 
                          type="file" 
                          accept="image/*"
                          onChange={handleSignatureUpload}
                          className="text-[10px] text-black/40 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-[10px] file:font-bold file:bg-primary-light file:text-primary-text hover:file:bg-primary-light/80 cursor-pointer"
                        />
                      </div>
                    </div>
                    <div className="pt-6 border-t border-black/5">
                      <h4 className="text-sm font-bold mb-4 flex items-center gap-2">
                        <ShieldCheck size={16} className="text-primary" />
                        GST Verification Status
                      </h4>
                      <div className={`p-4 rounded-2xl border ${gstConfig?.configured ? 'bg-emerald-50 border-emerald-100' : 'bg-orange-50 border-orange-100'}`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold uppercase tracking-wider text-black/40">Real-time API</span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${gstConfig?.configured ? 'bg-emerald-500 text-white' : 'bg-orange-500 text-white'}`}>
                            {gstConfig?.configured ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                        <p className="text-[10px] text-black/60 leading-relaxed">
                          {gstConfig?.configured 
                            ? `Connected to ${Object.entries(gstConfig.providers || {}).filter(([_, v]) => v).map(([k]) => k).join(', ')}. Real data will be fetched.`
                            : 'No API Key found. The system is currently using Demo/Mock data for GST lookups. Add RAZORPAY_KEY_ID or CLEARTAX_AUTH_TOKEN to Settings to enable real data.'}
                        </p>
                      </div>
                    </div>
                    <button 
                      type="submit"
                      disabled={updatingSettings}
                      className="w-full h-12 bg-primary text-white rounded-xl font-bold hover:bg-primary-hover transition-all disabled:opacity-50 mt-4"
                    >
                      {updatingSettings ? 'Updating...' : 'Save Settings'}
                    </button>
                  </form>
                </div>

                <div className="bg-white rounded-3xl p-8 shadow-sm border border-black/5">
                  <h3 className="text-xl font-semibold mb-6 flex items-center gap-2">
                    <Info className="text-primary" size={20} />
                    System Information
                  </h3>
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 bg-black/[0.02] rounded-2xl border border-black/5">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-black/40 mb-1">Total Rooms</p>
                        <p className="text-2xl font-bold">{rooms.length}</p>
                      </div>
                      <div className="p-4 bg-black/[0.02] rounded-2xl border border-black/5">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-black/40 mb-1">Active Bookings</p>
                        <p className="text-2xl font-bold">{allBookings.filter(b => b.status === 'confirmed').length}</p>
                      </div>
                    </div>
                    <div className="p-6 bg-primary-light rounded-2xl border border-primary-light">
                      <h4 className="font-bold text-primary-text mb-2">Database Status</h4>
                      <p className="text-sm text-primary-text/70 leading-relaxed">
                        Your hotel management system is connected to a Supabase database. 
                        All data is synchronized in real-time across all connected devices.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-2">
                <div className="bg-white rounded-3xl border border-black/5 shadow-sm overflow-hidden">
                  <div className="px-8 py-6 border-b border-black/5 bg-black/[0.01]">
                    <h3 className="font-bold">Current Inventory</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-black/5">
                          <th className="px-4 md:px-8 py-4 text-[10px] font-bold uppercase tracking-widest text-black/40">Room</th>
                          <th className="px-4 md:px-8 py-4 text-[10px] font-bold uppercase tracking-widest text-black/40">Type</th>
                          <th className="px-4 md:px-8 py-4 text-[10px] font-bold uppercase tracking-widest text-black/40">Price</th>
                          <th className="px-4 md:px-8 py-4 text-[10px] font-bold uppercase tracking-widest text-black/40">Plan</th>
                          <th className="px-4 md:px-8 py-4 text-[10px] font-bold uppercase tracking-widest text-black/40 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-black/5">
                        {rooms.map(room => (
                          <tr key={room.id} className="hover:bg-black/[0.01]">
                            <td className="px-4 md:px-8 py-4">
                              <span className="font-bold">#{room.room_number}</span>
                            </td>
                            <td className="px-4 md:px-8 py-4 text-sm text-black/60">{room.type}</td>
                            <td className="px-4 md:px-8 py-4 text-sm font-semibold">Rs. {room.price}</td>
                            <td className="px-4 md:px-8 py-4">
                              <span className="text-[10px] font-bold uppercase px-2 py-1 bg-primary-light text-primary-text rounded">
                                {room.plan || 'Only Room'}
                              </span>
                            </td>
                            <td className="px-4 md:px-8 py-4 text-right flex items-center justify-end gap-2">
                              <button 
                                onClick={() => setEditingRoom(room)}
                                className="p-2 bg-primary-light hover:bg-primary-light/80 rounded-lg text-primary-text transition-all"
                                title="Edit Room"
                              >
                                <Settings size={14} />
                              </button>
                              <button 
                                onClick={() => handleDeleteRoom(room.id)}
                                className="p-2 bg-rose-50 hover:bg-rose-100 rounded-lg text-rose-600 transition-all"
                                title="Delete Room"
                              >
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        ) : activeView === 'inventory' ? (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-12"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-3xl font-bold tracking-tight">Room Inventory</h2>
                <p className="text-black/40 mt-1">Manage your rooms, types, and base pricing.</p>
              </div>
            </div>

            <div className="grid lg:grid-cols-12 gap-12">
              <div className="lg:col-span-4">
                <div className="bg-white rounded-3xl p-8 shadow-sm border border-black/5 sticky top-24">
                  <h3 className="text-xl font-semibold mb-6 flex items-center gap-2">
                    <Plus className="text-primary" size={20} />
                    {editingRoom ? 'Edit Room' : 'Add New Room'}
                  </h3>
                  <form onSubmit={editingRoom ? handleUpdateRoom : handleAddRoom} className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-black/40">Room Number</label>
                      <input 
                        required
                        type="text"
                        value={(editingRoom ? editingRoom.room_number : newRoom.room_number) || ''}
                        onChange={(e) => editingRoom ? setEditingRoom({...editingRoom, room_number: e.target.value}) : setNewRoom({...newRoom, room_number: e.target.value})}
                        className="w-full h-12 px-4 rounded-xl bg-black/5 border-transparent focus:bg-white focus:border-primary focus:ring-0 transition-all outline-none"
                        placeholder="e.g. 101"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-black/40">Room Type</label>
                      <select 
                        value={(editingRoom ? editingRoom.type : newRoom.type) || 'Double Bed Room'}
                        onChange={(e) => editingRoom ? setEditingRoom({...editingRoom, type: e.target.value}) : setNewRoom({...newRoom, type: e.target.value})}
                        className="w-full h-12 px-4 rounded-xl bg-black/5 border-transparent focus:bg-white focus:border-primary focus:ring-0 transition-all outline-none"
                      >
                        <option>Double Bed Room</option>
                        <option>Double Bed Room (Balcony)</option>
                        <option>Four Bed Standard Room</option>
                        <option>Four Bed Deluxe Room</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-black/40">Price per Day (Rs.)</label>
                      <input 
                        required
                        type="number"
                        value={(editingRoom ? editingRoom.price : newRoom.price) ?? ''}
                        onChange={(e) => editingRoom ? setEditingRoom({...editingRoom, price: parseFloat(e.target.value) || 0}) : setNewRoom({...newRoom, price: e.target.value})}
                        className="w-full h-12 px-4 rounded-xl bg-black/5 border-transparent focus:bg-white focus:border-primary focus:ring-0 transition-all outline-none"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-black/40">Default Plan</label>
                      <select 
                        value={(editingRoom ? editingRoom.plan : newRoom.plan) || 'Only Room'}
                        onChange={(e) => editingRoom ? setEditingRoom({...editingRoom, plan: e.target.value}) : setNewRoom({...newRoom, plan: e.target.value})}
                        className="w-full h-12 px-4 rounded-xl bg-black/5 border-transparent focus:bg-white focus:border-primary focus:ring-0 transition-all outline-none"
                      >
                        <option>Only Room</option>
                        <option>Room With Breakfast</option>
                        <option>Food Package</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-black/40">Description</label>
                      <textarea 
                        value={(editingRoom ? editingRoom.description : newRoom.description) || ''}
                        onChange={(e) => editingRoom ? setEditingRoom({...editingRoom, description: e.target.value}) : setNewRoom({...newRoom, description: e.target.value})}
                        className="w-full h-24 px-4 py-3 rounded-xl bg-black/5 border-transparent focus:bg-white focus:border-primary focus:ring-0 transition-all outline-none resize-none"
                        placeholder="Room features..."
                      />
                    </div>
                    <div className="flex gap-3">
                      {editingRoom && (
                        <button 
                          type="button"
                          onClick={() => setEditingRoom(null)}
                          className="flex-1 h-12 bg-black/5 text-black rounded-xl font-bold hover:bg-black/10 transition-all"
                        >
                          Cancel
                        </button>
                      )}
                      <button 
                        type="submit"
                        disabled={addingRoom}
                        className="flex-[2] h-12 bg-primary text-white rounded-xl font-bold hover:bg-primary-hover transition-all disabled:opacity-50"
                      >
                        {addingRoom ? 'Saving...' : editingRoom ? 'Update Room' : 'Add Room'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>

              <div className="lg:col-span-8">
                <div className="grid md:grid-cols-2 gap-6">
                  {rooms.map(room => (
                    <motion.div 
                      key={room.id}
                      layout
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="bg-white rounded-3xl p-6 shadow-sm border border-black/5 group hover:border-primary transition-all"
                    >
                      <div className="flex justify-between items-start mb-4">
                        <div className="w-12 h-12 bg-primary-light rounded-2xl flex items-center justify-center text-primary">
                          <Bed size={24} />
                        </div>
                        <div className="flex gap-2 transition-opacity">
                          <button 
                            onClick={() => setEditingRoom(room)}
                            className="p-2 bg-black/5 hover:bg-black/10 rounded-lg text-black/60 transition-all"
                            title="Edit Room"
                          >
                            <Settings size={16} />
                          </button>
                          <button 
                            onClick={() => handleDeleteRoom(room.id)}
                            className="p-2 bg-rose-50 hover:bg-rose-100 rounded-lg text-rose-600 transition-all"
                            title="Delete Room"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-xl font-bold">Room {room.room_number}</h4>
                      </div>
                      <p className="text-sm text-black/40 mb-4">{room.type}</p>
                      <div className="flex items-center justify-between pt-4 border-t border-black/5">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-black/30">Price</p>
                          <p className="text-lg font-bold text-primary">Rs. {room.price}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-black/30">Plan</p>
                          <p className="text-sm font-semibold">{room.plan}</p>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        ) : null}
      </main>

      {/* Booking Review Modal */}
      <AnimatePresence>
        {showManualBill && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowManualBill(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-[32px] overflow-hidden shadow-2xl"
            >
              <div className="p-8 max-h-[90vh] overflow-y-auto no-scrollbar">
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-2xl font-bold flex items-center gap-3">
                    <FileText className="text-primary" size={24} />
                    Create Manual Bill
                  </h2>
                  <button 
                    onClick={() => setShowManualBill(false)}
                    className="p-2 hover:bg-black/5 rounded-full transition-all"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-black/40">Guest GST Number</label>
                      <div className="relative">
                        <input 
                          type="text"
                          placeholder="15-digit GSTIN"
                          value={manualBillData.guest_gst}
                          onChange={(e) => {
                            const val = e.target.value.toUpperCase();
                            setManualBillData({...manualBillData, guest_gst: val});
                            if (val.length === 15) fetchGSTDetails(val);
                          }}
                          className="w-full h-12 px-4 rounded-xl bg-black/5 border-transparent focus:bg-white focus:border-primary focus:ring-0 transition-all outline-none"
                        />
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
                          {fetchingGST && (
                            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                          )}
                          <button
                            type="button"
                            onClick={() => window.open(`https://services.gst.gov.in/services/searchtp?gstin=${manualBillData.guest_gst}`, '_blank')}
                            className="p-2 hover:bg-black/5 rounded-lg text-black/30 hover:text-primary transition-all"
                            title="Verify on Official GST Portal"
                          >
                            <ExternalLink size={16} />
                          </button>
                        </div>
                      </div>
                      {fetchingAI && (
                        <p className="text-[10px] text-primary font-medium mt-1 flex items-center gap-1 animate-pulse">
                          <Sparkles size={10} /> Searching with AI...
                        </p>
                      )}
                      {usingMockGST && (
                        <p className="text-[10px] text-orange-600 font-medium mt-1 animate-pulse">
                          ⚠️ Using Demo Data. Configure API Key in Settings for real data.
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-black/40">Guest Name</label>
                      <input 
                        type="text"
                        value={manualBillData.guest_name}
                        onChange={(e) => setManualBillData({...manualBillData, guest_name: e.target.value})}
                        className="w-full h-12 px-4 rounded-xl bg-black/5 border-transparent focus:bg-white focus:border-primary focus:ring-0 transition-all outline-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-black/40">Guest Address</label>
                    <input 
                      type="text"
                      value={manualBillData.guest_address}
                      onChange={(e) => setManualBillData({...manualBillData, guest_address: e.target.value})}
                      className="w-full h-12 px-4 rounded-xl bg-black/5 border-transparent focus:bg-white focus:border-primary focus:ring-0 transition-all outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-black/40">Phone Number</label>
                      <input 
                        type="text"
                        value={manualBillData.guest_phone}
                        onChange={(e) => setManualBillData({...manualBillData, guest_phone: e.target.value})}
                        className="w-full h-12 px-4 rounded-xl bg-black/5 border-transparent focus:bg-white focus:border-primary focus:ring-0 transition-all outline-none"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-black/40">Email Address</label>
                      <input 
                        type="email"
                        value={manualBillData.guest_email}
                        onChange={(e) => setManualBillData({...manualBillData, guest_email: e.target.value})}
                        className="w-full h-12 px-4 rounded-xl bg-black/5 border-transparent focus:bg-white focus:border-primary focus:ring-0 transition-all outline-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-black/40">Rooms & Prices</label>
                      <button 
                        onClick={() => setManualBillData({
                          ...manualBillData, 
                          rooms: [...manualBillData.rooms, { room_number: '', room_type: '', room_price: 0 }]
                        })}
                        className="text-xs font-bold text-primary flex items-center gap-1 hover:underline"
                      >
                        <Plus size={14} /> Add Room
                      </button>
                    </div>
                    {manualBillData.rooms.map((room, index) => (
                      <div key={index} className="p-4 rounded-2xl bg-black/5 space-y-4 relative">
                        {manualBillData.rooms.length > 1 && (
                          <button 
                            onClick={() => {
                              const newRooms = manualBillData.rooms.filter((_, i) => i !== index);
                              setManualBillData({...manualBillData, rooms: newRooms});
                            }}
                            className="absolute top-2 right-2 p-1 text-black/20 hover:text-red-500 transition-all"
                          >
                            <X size={14} />
                          </button>
                        )}
                          <div className="grid grid-cols-4 gap-4">
                            <div className="space-y-2">
                              <label className="text-[10px] font-bold uppercase tracking-widest text-black/40">Room No</label>
                              <input 
                                type="text"
                                value={room.room_number}
                                onChange={(e) => {
                                  const newRooms = [...manualBillData.rooms];
                                  newRooms[index].room_number = e.target.value;
                                  setManualBillData({...manualBillData, rooms: newRooms});
                                }}
                                className="w-full h-10 px-3 rounded-lg bg-white border-transparent focus:border-primary focus:ring-0 transition-all outline-none text-sm"
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-[10px] font-bold uppercase tracking-widest text-black/40">Type</label>
                              <input 
                                type="text"
                                value={room.room_type}
                                onChange={(e) => {
                                  const newRooms = [...manualBillData.rooms];
                                  newRooms[index].room_type = e.target.value;
                                  setManualBillData({...manualBillData, rooms: newRooms});
                                }}
                                className="w-full h-10 px-3 rounded-lg bg-white border-transparent focus:border-primary focus:ring-0 transition-all outline-none text-sm"
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-[10px] font-bold uppercase tracking-widest text-black/40">Total Fare (Incl. GST)</label>
                              <input 
                                type="number"
                                placeholder="Total"
                                onChange={(e) => {
                                  const totalFare = parseFloat(e.target.value) || 0;
                                  let basePrice = totalFare;
                                  if (totalFare >= 8850) basePrice = totalFare / 1.18;
                                  else if (totalFare >= 1050) basePrice = totalFare / 1.05;
                                  
                                  const newRooms = [...manualBillData.rooms];
                                  newRooms[index].room_price = parseFloat(basePrice.toFixed(2));
                                  setManualBillData({...manualBillData, rooms: newRooms});
                                }}
                                className="w-full h-10 px-3 rounded-lg bg-white border-transparent focus:border-primary focus:ring-0 transition-all outline-none text-sm"
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-[10px] font-bold uppercase tracking-widest text-black/40">Base Price</label>
                              <input 
                                type="number"
                                value={room.room_price}
                                onChange={(e) => {
                                  const newRooms = [...manualBillData.rooms];
                                  newRooms[index].room_price = parseFloat(e.target.value) || 0;
                                  setManualBillData({...manualBillData, rooms: newRooms});
                                }}
                                className="w-full h-10 px-3 rounded-lg bg-white border-transparent focus:border-primary focus:ring-0 transition-all outline-none text-sm"
                              />
                            </div>
                          </div>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-black/40">Check-in</label>
                      <input 
                        type="date"
                        value={manualBillData.check_in}
                        onChange={(e) => setManualBillData({...manualBillData, check_in: e.target.value})}
                        className="w-full h-12 px-4 rounded-xl bg-black/5 border-transparent focus:bg-white focus:border-primary focus:ring-0 transition-all outline-none"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-black/40">Check-out</label>
                      <input 
                        type="date"
                        value={manualBillData.check_out}
                        onChange={(e) => setManualBillData({...manualBillData, check_out: e.target.value})}
                        className="w-full h-12 px-4 rounded-xl bg-black/5 border-transparent focus:bg-white focus:border-primary focus:ring-0 transition-all outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-black/40">{hotelSettings.additional_charge_name || 'Additional Charge'}</label>
                      <input 
                        type="number"
                        value={manualBillData.dsda_charge}
                        onChange={(e) => setManualBillData({...manualBillData, dsda_charge: parseFloat(e.target.value) || 0})}
                        className="w-full h-12 px-4 rounded-xl bg-black/5 border-transparent focus:bg-white focus:border-primary focus:ring-0 transition-all outline-none"
                      />
                    </div>
                    <div className="flex items-center gap-3 pt-6">
                      <input 
                        type="checkbox"
                        id="include_dsda"
                        checked={manualBillData.include_dsda}
                        onChange={(e) => setManualBillData({...manualBillData, include_dsda: e.target.checked})}
                        className="w-5 h-5 rounded border-black/10 text-primary focus:ring-primary"
                      />
                      <label htmlFor="include_dsda" className="text-sm font-medium text-black/60">Include in Bill</label>
                    </div>
                  </div>

                  <div className="flex gap-4 pt-4">
                    <button 
                      onClick={() => {
                        const bookingId = `MANUAL-${Date.now()}`;
                        const mockBookings: any[] = manualBillData.rooms.map((room, idx) => ({
                          id: Date.now() + idx,
                          booking_id: bookingId,
                          guest_name: manualBillData.guest_name,
                          guest_phone: manualBillData.guest_phone,
                          guest_email: manualBillData.guest_email,
                          guest_address: manualBillData.guest_address,
                          guest_gst: manualBillData.guest_gst,
                          room_number: room.room_number,
                          room_type: room.room_type,
                          room_price: room.room_price,
                          check_in: manualBillData.check_in,
                          check_out: manualBillData.check_out,
                          dsda_charge: idx === 0 ? manualBillData.dsda_charge : 0,
                          advance_payment: 0,
                          adults: 1,
                          children: 0
                        }));
                        downloadReceiptForBooking(mockBookings[0], manualBillData.include_dsda, mockBookings);
                      }}
                      className="flex-1 h-14 bg-black/5 text-black rounded-2xl font-bold hover:bg-black/10 transition-all flex items-center justify-center gap-2"
                    >
                      <Printer size={20} />
                      Normal Bill
                    </button>
                    <button 
                      onClick={() => {
                        const bookingId = `MANUAL-${Date.now()}`;
                        const mockBookings: any[] = manualBillData.rooms.map((room, idx) => ({
                          id: Date.now() + idx,
                          booking_id: bookingId,
                          guest_name: manualBillData.guest_name,
                          guest_phone: manualBillData.guest_phone,
                          guest_email: manualBillData.guest_email,
                          guest_address: manualBillData.guest_address,
                          guest_gst: manualBillData.guest_gst,
                          room_number: room.room_number,
                          room_type: room.room_type,
                          room_price: room.room_price,
                          check_in: manualBillData.check_in,
                          check_out: manualBillData.check_out,
                          dsda_charge: idx === 0 ? manualBillData.dsda_charge : 0,
                          advance_payment: 0,
                          adults: 1,
                          children: 0
                        }));
                        generateGSTBillPDF(mockBookings[0], manualBillData.include_dsda, mockBookings);
                      }}
                      className="flex-1 h-14 bg-primary text-white rounded-2xl font-bold hover:bg-primary-hover transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/20"
                    >
                      <FileText size={20} />
                      GST Bill
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {showReview && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowReview(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="bg-primary p-8 text-white">
                <h3 className="text-2xl font-bold">Review Your Booking</h3>
                <p className="text-white/80 opacity-80 mt-1">Please confirm the details below before finalizing your reservation.</p>
              </div>
              
              <div className="p-8 space-y-8 max-h-[70vh] overflow-y-auto">
                <div className="grid md:grid-cols-2 gap-8">
                  <div className="space-y-6">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-black/40 mb-2">Guest Information</p>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary-light text-primary-text flex items-center justify-center font-bold">
                          {guestName.charAt(0)}
                        </div>
                        <div>
                          <p className="font-bold text-lg">{guestName}</p>
                          <p className="text-sm text-black/40">{guestEmail} • {guestPhone}</p>
                          <p className="text-sm text-black/40">{adults} Adults, {children} Children</p>
                        </div>
                      </div>
                    </div>

                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-black/40 mb-2">Stay Details</p>
                      <div className="space-y-3">
                        <div className="flex items-center gap-3 text-sm">
                          <Calendar className="text-primary" size={16} />
                          <span className="font-medium">{checkIn} to {checkOut}</span>
                          <span className="px-2 py-0.5 bg-black/5 rounded text-[10px] font-bold uppercase">{calculateNights(checkIn, checkOut)} Days</span>
                        </div>
                        <div className="flex items-center gap-3 text-sm">
                          <Clock className="text-primary" size={16} />
                          <span className="font-medium">Check-in: 10:30 AM | Check-out: {departureTime}</span>
                        </div>
                        <div className="flex items-center gap-3 text-sm">
                          <Filter className="text-primary" size={16} />
                          <span className="font-medium">Selected Plan: {selectedPlan}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-black/40 mb-2">Selected Rooms</p>
                      <div className="space-y-2">
                        {rooms.filter(r => selectedRoomIds.includes(r.id)).map(room => (
                          <div key={room.id} className="flex items-center justify-between p-3 bg-black/[0.02] rounded-xl border border-black/5">
                            <div>
                              <p className="text-sm font-bold">Room {room.room_number}</p>
                              <p className="text-[10px] text-black/40">{room.type}</p>
                            </div>
                            <p className="text-sm font-bold">Rs. {(customPrices[room.id] ?? room.price) * calculateNights(checkIn, checkOut)}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-8 border-t border-black/5 flex justify-between items-end">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-black/40">Total Amount Due</p>
                    <div className="flex flex-col">
                      <p className="text-4xl font-bold text-primary">
                        Rs. {rooms
                          .filter(r => selectedRoomIds.includes(r.id))
                          .reduce((acc, curr) => acc + ((customPrices[curr.id] ?? curr.price) * calculateNights(checkIn, checkOut)), 0) + parseFloat(dsdaCharge || '0')
                        }
                      </p>
                      {parseFloat(dsdaCharge) > 0 && (
                        <p className="text-[10px] text-black/40 mt-1">Includes Rs. {dsdaCharge} {hotelSettings.additional_charge_name || 'Additional Charge'}</p>
                      )}
                      {parseFloat(advancePayment) > 0 && (
                        <p className="text-[10px] text-emerald-600 font-bold mt-1">Advance Payment: Rs. {advancePayment}</p>
                      )}
                    </div>
                  </div>
                  <div className="text-right text-[10px] text-black/30">
                    <p>Balance to pay: Rs. {
                      (rooms
                        .filter(r => selectedRoomIds.includes(r.id))
                        .reduce((acc, curr) => acc + ((customPrices[curr.id] ?? curr.price) * calculateNights(checkIn, checkOut)), 0) + parseFloat(dsdaCharge || '0')) - parseFloat(advancePayment || '0')
                    }</p>
                    <p>Prices include all applicable taxes</p>
                  </div>
                </div>
              </div>

              <div className="p-8 bg-black/[0.02] border-t border-black/5 flex gap-4">
                <button
                  onClick={() => setShowReview(false)}
                  className="flex-1 h-14 bg-white border border-black/10 text-black rounded-2xl font-bold hover:bg-white/80 transition-all"
                >
                  Back to Edit
                </button>
                <button
                  onClick={handleBooking}
                  disabled={loading}
                  className="flex-[2] h-14 bg-primary text-white rounded-2xl font-bold hover:bg-primary-hover transition-all shadow-lg shadow-primary-light flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {loading ? 'Processing...' : 'Finalize Reservation'}
                  {!loading && <CheckCircle2 size={20} />}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-6 py-12 border-t border-black/5 mt-12">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2 text-black/40">
            {hotelSettings.logo_url ? (
              <img src={hotelSettings.logo_url} alt="Logo" className="w-6 h-6 object-cover rounded" referrerPolicy="no-referrer" />
            ) : (
              <Hotel size={18} />
            )}
            <span className="text-sm font-medium">© 2026 {hotelSettings.hotel_name} Management System</span>
          </div>
          <div className="text-center md:text-right">
            <p className="text-xs text-black/30 mb-2">{hotelSettings.contact_info}</p>
            <div className="flex gap-8 text-sm font-medium text-black/40">
              <a href="#" className="hover:text-black transition-colors">Privacy Policy</a>
              <a href="#" className="hover:text-black transition-colors">Terms of Service</a>
              <a href="#" className="hover:text-black transition-colors">Support</a>
            </div>
          </div>
        </div>
      </footer>
      {/* Edit Booking Modal */}
      <AnimatePresence>
        {editingBooking && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingBooking(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="bg-primary p-6 text-white">
                <h3 className="text-xl font-bold">Change Booking Details</h3>
                <p className="text-white/80 text-xs mt-1">Update guest information for this booking group.</p>
              </div>
              
              <form onSubmit={handleUpdateBooking} className="p-6 space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-black/40">Guest Name</label>
                  <input 
                    required
                    type="text"
                    value={editGuestName}
                    onChange={(e) => setEditGuestName(e.target.value)}
                    className="w-full h-12 px-4 rounded-xl bg-black/5 border-transparent focus:bg-white focus:border-primary focus:ring-0 transition-all outline-none"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-black/40">Email Address</label>
                  <input 
                    required
                    type="email"
                    value={editGuestEmail}
                    onChange={(e) => setEditGuestEmail(e.target.value)}
                    className="w-full h-12 px-4 rounded-xl bg-black/5 border-transparent focus:bg-white focus:border-primary focus:ring-0 transition-all outline-none"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-black/40">Phone Number</label>
                  <input 
                    required
                    type="text"
                    value={editGuestPhone}
                    onChange={(e) => setEditGuestPhone(e.target.value)}
                    className="w-full h-12 px-4 rounded-xl bg-black/5 border-transparent focus:bg-white focus:border-primary focus:ring-0 transition-all outline-none"
                  />
                </div>
                
                <div className="flex gap-3 pt-4">
                  <button 
                    type="button"
                    onClick={() => setEditingBooking(null)}
                    className="flex-1 h-12 bg-black/5 text-black rounded-xl font-bold hover:bg-black/10 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={updatingBooking}
                    className="flex-[2] h-12 bg-primary text-white rounded-xl font-bold hover:bg-primary-hover transition-all disabled:opacity-50"
                  >
                    {updatingBooking ? 'Updating...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
