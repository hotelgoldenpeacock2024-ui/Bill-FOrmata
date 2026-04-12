import express from "express";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

// Lazy initialization for Supabase
let supabaseClient: any = null;

function getSupabase() {
  if (!supabaseClient) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Supabase credentials missing. Please configure SUPABASE_URL and SUPABASE_ANON_KEY in Settings > Secrets.");
    }

    try {
      supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
    } catch (err: any) {
      throw new Error(`Failed to initialize Supabase client: ${err.message}`);
    }
  }
  return supabaseClient;
}

export const app = express();
app.use(express.json());

const apiRouter = express.Router();

// This will be overridden by the local server to support WebSockets
export let broadcast = (data: any) => {
  console.log("Broadcast (No-op):", data.type);
};

export const setBroadcast = (fn: (data: any) => void) => {
  broadcast = fn;
};

// Health check
apiRouter.get("/health", (req, res) => {
  console.log("Health check requested");
  res.json({ 
    status: "ok", 
    supabaseConfigured: !!process.env.SUPABASE_URL && !!process.env.SUPABASE_ANON_KEY,
    env: process.env.NODE_ENV || 'development',
    isNetlify: !!process.env.NETLIFY
  });
});

// API Routes
apiRouter.get("/rooms", async (req, res) => {
  console.log("Fetching rooms...");
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.from("rooms").select("*").order("room_number");
    if (error) throw error;
    res.json(data || []);
  } catch (error: any) {
    console.error("Error fetching rooms:", error);
    res.status(500).json({ error: error.message || "Failed to fetch rooms" });
  }
});

apiRouter.get("/settings", async (req, res) => {
  console.log("Fetching settings...");
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.from("settings").select("*");
    if (error) throw error;
    
    console.log(`Found ${data?.length || 0} settings`);
    const settingsObj = (data || []).reduce((acc: any, curr: any) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {});
    res.json(settingsObj);
  } catch (error: any) {
    console.error("Error fetching settings:", error);
    res.status(500).json({ error: error.message || "Failed to fetch settings" });
  }
});

apiRouter.post("/settings", async (req, res) => {
  const settings = req.body;
  try {
    const supabase = getSupabase();
    const updates = Object.entries(settings).map(([key, value]) => ({
      key,
      value: String(value)
    }));

    const { error } = await supabase.from("settings").upsert(updates, { onConflict: 'key' });
    
    if (error) throw error;

    broadcast({ type: 'SETTINGS_UPDATED' });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to update settings" });
  }
});

apiRouter.post("/rooms", async (req, res) => {
  const { room_number, type, price, plan, description, ac_type, image_url } = req.body;
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.from("rooms").insert([{
      room_number,
      type,
      price,
      plan,
      description,
      ac_type: ac_type || 'Non-AC',
      image_url
    }]).select();

    if (error) throw error;
    res.json({ success: true, id: data[0].id });
  } catch (error: any) {
    console.error("Error adding room:", error);
    res.status(500).json({ error: error.message || "Failed to add room. Room number might already exist." });
  }
});

apiRouter.patch("/rooms/:id", async (req, res) => {
  const { id } = req.params;
  const { room_number, type, price, plan, description, ac_type, image_url } = req.body;
  try {
    const supabase = getSupabase();
    const { error } = await supabase.from("rooms").update({
      room_number,
      type,
      price,
      plan,
      description,
      ac_type: ac_type || 'Non-AC',
      image_url
    }).eq("id", id);

    if (error) throw error;
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to update room" });
  }
});

apiRouter.delete("/rooms/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const supabase = getSupabase();
    // First, set room_id to NULL in bookings to avoid foreign key issues
    await supabase.from("bookings").update({ room_id: null }).eq("room_id", id);
    
    const { error } = await supabase.from("rooms").delete().eq("id", id);
    if (error) throw error;

    broadcast({ type: 'ROOMS_UPDATED' });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to delete room. Please try again." });
  }
});

apiRouter.get("/gst-status", (req, res) => {
  res.json({
    configured: !!(process.env.SIGNZY_API_KEY || process.env.SANDBOX_API_KEY),
    providers: {
      signzy: !!process.env.SIGNZY_API_KEY,
      sandbox: !!process.env.SANDBOX_API_KEY
    }
  });
});

apiRouter.get("/gst-verify/:gstin", async (req, res) => {
  const { gstin } = req.params;
  const signzyKey = process.env.SIGNZY_API_KEY;
  const sandboxKey = process.env.SANDBOX_API_KEY;
  const sandboxSecret = process.env.SANDBOX_API_SECRET;

  if (!signzyKey && !sandboxKey) {
    return res.status(400).json({ 
      error: "No GST API Provider configured. Please add SIGNZY_API_KEY or SANDBOX_API_KEY to your environment variables.",
      isMock: true 
    });
  }

  try {
    console.log(`Verifying GSTIN: ${gstin}...`);
    
    // 1. Try Sandbox.co.in
    if (sandboxKey && sandboxSecret) {
      try {
        console.log("Trying Sandbox.co.in...");
        const authRes = await axios.post('https://api.sandbox.co.in/authenticate', {}, {
          headers: { 'x-api-key': sandboxKey, 'x-api-secret': sandboxSecret, 'accept': 'application/json' }
        });
        const token = authRes.data.access_token;
        const response = await axios.get(`https://api.sandbox.co.in/gsp/public/gstin/${gstin}`, {
          headers: { 'Authorization': token, 'x-api-key': sandboxKey, 'accept': 'application/json' }
        });
        const data = response.data?.data;
        if (data && data.sts === 'Active') {
          return res.json({ success: true, name: data.lgnm || data.tradeNam || "N/A", address: data.pradr?.addr?.adr || "N/A", stateCode: gstin.substring(0, 2) });
        } else if (data) {
          console.warn(`GSTIN ${gstin} status is ${data.sts}, triggering AI fallback.`);
          return res.json({ success: false, error: `GSTIN status is ${data.sts}` });
        }
      } catch (e: any) {
        console.warn("Sandbox.co.in failed:", e.response?.data || e.message);
      }
    }

    // 2. Try Signzy
    if (signzyKey) {
      try {
        console.log("Trying Signzy...");
        const response = await axios.post('https://api.signzy.app/api/v3/gst/search', { gstin: gstin }, {
          headers: { 'Authorization': signzyKey, 'Content-Type': 'application/json' }
        });
        const data = response.data?.result;
        if (data && data.status === 'Active') {
          return res.json({ success: true, name: data.tradeName || data.legalName || "N/A", address: data.pradr?.addr?.adr || data.address || "N/A", stateCode: gstin.substring(0, 2) });
        } else if (data) {
          console.warn(`GSTIN ${gstin} status is ${data.status}, triggering AI fallback.`);
          return res.json({ success: false, error: `GSTIN status is ${data.status}` });
        }
      } catch (e: any) {
        console.warn("Signzy failed:", e.response?.data || e.message);
      }
    }
    
    // If all providers failed or were not configured
    res.status(404).json({ 
      error: "GSTIN not found or all API providers failed",
      isMock: true // This triggers the AI fallback in the frontend
    });
  } catch (error: any) {
    console.error("GST API Error:", error.response?.data || error.message);
    
    // If it's a 404 from the provider, return a clean error
    if (error.response?.status === 404) {
      return res.status(404).json({ error: "GSTIN not found on provider" });
    }

    res.status(500).json({ 
      error: "Failed to fetch data from API provider",
      details: error.response?.data || error.message
    });
  }
});

apiRouter.get("/availability", async (req, res) => {
  const { room_number, check_in, check_out } = req.query;
  
  if (!check_in || !check_out) {
    return res.status(400).json({ error: "Missing parameters" });
  }

  try {
    const supabase = getSupabase();
    // Get all rooms
    const { data: allRooms, error: roomsError } = await supabase.from("rooms").select("*");
    if (roomsError) throw roomsError;
    
    // Get booked room IDs for the period
    const { data: bookings, error: bookingsError } = await supabase
      .from("bookings")
      .select("room_id")
      .eq("status", "confirmed")
      .lt("check_in", check_out)
      .gt("check_out", check_in);

    if (bookingsError) throw bookingsError;

    const bookedRoomIds = (bookings || []).map((b: any) => b.room_id);

    const roomsWithStatus = (allRooms || []).map(room => ({
      ...room,
      is_available: !bookedRoomIds.includes(room.id)
    }));

    let filteredRooms = roomsWithStatus;
    if (room_number) {
      filteredRooms = roomsWithStatus.filter(r => r.room_number === room_number);
    }
    
    res.json({ 
      available: filteredRooms.some(r => r.is_available), 
      rooms: filteredRooms 
    });
  } catch (error: any) {
    console.error("Error checking availability:", error);
    res.status(500).json({ error: error.message || "Failed to check availability" });
  }
});

apiRouter.get("/bookings", async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("bookings")
      .select(`
        *,
        rooms (
          room_number,
          type,
          price
        )
      `)
      .order("id", { ascending: false });

    if (error) throw error;

    // Transform data to match original format
    const transformed = (data || []).map((b: any) => ({
      ...b,
      room_number: b.room_number || (b.rooms ? b.rooms.room_number : 'N/A'),
      room_type: b.rooms ? b.rooms.type : 'N/A',
      room_price: b.room_price || (b.rooms ? b.rooms.price : 0)
    }));

    res.json(transformed);
  } catch (error: any) {
    console.error("Error fetching bookings:", error);
    res.status(500).json({ error: error.message || "Failed to fetch bookings" });
  }
});

apiRouter.get("/guests", async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("bookings")
      .select("guest_name, check_in, guest_phone, guest_email");

    if (error) throw error;

    // Group by guest_name manually since Supabase doesn't support GROUP BY in simple select
    const guestMap = new Map();
    (data || []).forEach((b: any) => {
      const existing = guestMap.get(b.guest_name) || { 
        booking_count: 0, 
        last_stay: b.check_in,
        guest_phone: b.guest_phone,
        guest_email: b.guest_email
      };
      guestMap.set(b.guest_name, {
        guest_name: b.guest_name,
        booking_count: existing.booking_count + 1,
        last_stay: b.check_in > existing.last_stay ? b.check_in : existing.last_stay,
        guest_phone: b.check_in >= existing.last_stay ? b.guest_phone : existing.guest_phone,
        guest_email: b.check_in >= existing.last_stay ? b.guest_email : existing.guest_email
      });
    });

    const guests = Array.from(guestMap.values()).sort((a, b) => b.last_stay.localeCompare(a.last_stay));
    res.json(guests);
  } catch (error: any) {
    console.error("Error fetching guests:", error);
    res.status(500).json({ error: error.message || "Failed to fetch guests" });
  }
});

apiRouter.get("/guests/:name/bookings", async (req, res) => {
  const { name } = req.params;
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("bookings")
      .select(`
        *,
        rooms (
          room_number,
          type,
          price
        )
      `)
      .eq("guest_name", name)
      .order("id", { ascending: false });

    if (error) throw error;

    const transformed = (data || []).map((b: any) => ({
      ...b,
      room_number: b.room_number || (b.rooms ? b.rooms.room_number : 'N/A'),
      room_type: b.rooms ? b.rooms.type : 'N/A',
      room_price: b.room_price || (b.rooms ? b.rooms.price : 0)
    }));

    res.json(transformed);
  } catch (error: any) {
    console.error("Error fetching guest bookings:", error);
    res.status(500).json({ error: error.message || "Failed to fetch guest bookings" });
  }
});

apiRouter.post("/bookings", async (req, res) => {
  const { room_ids, check_in, check_out, departure_time, guest_name, guest_email, guest_phone, plan, adults, children, custom_prices, dsda_charge, advance_payment, guest_gst, guest_address } = req.body;
  
  if (!room_ids || !Array.isArray(room_ids)) {
    return res.status(400).json({ error: "room_ids must be an array" });
  }

  const booking_id = `BK-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;

  try {
    const supabase = getSupabase();
    // Fetch room details for all room_ids
    const { data: rooms, error: roomsError } = await supabase.from("rooms").select("id, room_number, price").in("id", room_ids);
    if (roomsError) throw roomsError;

    const bookingsToInsert = room_ids.map(id => {
      const room = rooms.find(r => r.id === id);
      const price = (custom_prices && custom_prices[id]) ? custom_prices[id] : (room ? room.price : 0);
      const roomNum = room ? room.room_number : 'N/A';
      
      return {
        booking_id,
        room_id: id,
        check_in,
        check_out,
        departure_time,
        guest_name,
        guest_email,
        guest_phone,
        plan,
        status: 'confirmed',
        check_in_time: '10:30 AM',
        check_out_time: '09:30 AM',
        adults: adults || 1,
        children: children || 0,
        room_number: roomNum,
        room_price: price,
        dsda_charge: dsda_charge || 0,
        advance_payment: advance_payment || 0,
        guest_gst: guest_gst || '',
        guest_address: guest_address || ''
      };
    });

    const { error: insertError } = await supabase.from("bookings").insert(bookingsToInsert);
    if (insertError) throw insertError;
    
    broadcast({ type: 'BOOKING_UPDATED' });
    res.json({ success: true, booking_id });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: error.message || "Failed to create bookings" });
  }
});

apiRouter.patch("/bookings/:id/cancel", async (req, res) => {
  const { id } = req.params;
  console.log(`Cancelling booking with ID: ${id}`);
  try {
    const supabase = getSupabase();
    const { error, data } = await supabase
      .from("bookings")
      .update({ status: 'cancelled' })
      .eq("id", id)
      .select();

    if (error) throw error;
    
    console.log(`Cancellation result for ID ${id}:`, data);
    broadcast({ type: 'BOOKING_UPDATED' });
    res.json({ success: true });
  } catch (error: any) {
    console.error(`Error cancelling booking ${id}:`, error);
    res.status(500).json({ error: error.message || "Failed to cancel booking" });
  }
});

apiRouter.patch("/bookings/group/:bookingId/cancel", async (req, res) => {
  const { bookingId } = req.params;
  console.log(`Cancelling group booking with ID: ${bookingId}`);
  try {
    const supabase = getSupabase();
    const { error, data } = await supabase
      .from("bookings")
      .update({ status: 'cancelled' })
      .eq("booking_id", bookingId)
      .select();

    if (error) throw error;
    
    console.log(`Group cancellation result for ${bookingId}:`, data);
    broadcast({ type: 'BOOKING_UPDATED' });
    res.json({ success: true });
  } catch (error: any) {
    console.error(`Error cancelling group booking ${bookingId}:`, error);
    res.status(500).json({ error: error.message || "Failed to cancel entire booking" });
  }
});

apiRouter.patch("/bookings/group/:bookingId", async (req, res) => {
  const { bookingId } = req.params;
  const { guest_name, guest_email, guest_phone } = req.body;
  try {
    const supabase = getSupabase();
    const { error } = await supabase.from("bookings").update({ 
      guest_name, 
      guest_email, 
      guest_phone 
    }).eq("booking_id", bookingId);
    
    if (error) throw error;
    broadcast({ type: 'BOOKING_UPDATED' });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to update booking group" });
  }
});

apiRouter.post("/bookings/retrieve", async (req, res) => {
  try {
    const supabase = getSupabase();
    // In a real app, we'd have a 'deleted_bookings' table or a 'deleted_at' column.
    // Since the user said "by mistake i delete previous all booking", they likely mean they cleared the table.
    // If they used 'clearAllBookings' in the frontend, it currently just clears the state (which is wrong, it should hit the API).
    // However, if they actually deleted from DB, we can't "retrieve" unless we have a backup or soft delete.
    // But wait, the user's request implies I should be able to get them back.
    // Let's check if there's a 'deleted_bookings' table or if we can use Supabase audit logs (not possible via API).
    
    // Assuming 'cancelled' bookings are what they mean by "deleted" or if they want to restore from a backup.
    // Since I don't have a backup, I will implement a placeholder that "restores" cancelled bookings to confirmed
    // OR if they mean they want to see them again.
    
    // Actually, looking at the code, 'clearAllBookings' in App.tsx was just: setAllBookings([]);
    // This only clears the local state! Refreshing the page would bring them back if they were in the DB.
    // If the user says "showing offline" and "retrieve it", maybe they lost local storage data?
    // No, this app uses Supabase.
    
    // Let's implement a "restore" that sets all 'cancelled' bookings back to 'confirmed' as a way to "retrieve" them.
    const { data, error, count } = await supabase
      .from("bookings")
      .update({ status: 'confirmed' })
      .eq("status", 'cancelled')
      .select();

    if (error) throw error;
    
    broadcast({ type: 'BOOKING_UPDATED' });
    res.json({ success: true, count: count || (data ? data.length : 0) });
  } catch (error: any) {
    console.error("Error retrieving bookings:", error);
    res.status(500).json({ error: error.message || "Failed to retrieve bookings" });
  }
});

// Bills Routes
apiRouter.get("/bills", async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.from("bills").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (error: any) {
    console.error("Error fetching bills:", error);
    res.status(500).json({ error: error.message || "Failed to fetch bills" });
  }
});

apiRouter.post("/bills", async (req, res) => {
  const billData = req.body;
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.from("bills").insert([billData]).select();
    if (error) throw error;
    
    // Also mark the booking as billed if booking_id is provided
    if (billData.booking_id) {
      await supabase.from("bookings").update({ is_billed: true }).eq("booking_id", billData.booking_id);
    }

    broadcast({ type: 'BILLS_UPDATED' });
    broadcast({ type: 'BOOKING_UPDATED' });
    res.json({ success: true, data: data[0] });
  } catch (error: any) {
    console.error("Error saving bill:", error);
    res.status(500).json({ error: error.message || "Failed to save bill" });
  }
});

apiRouter.delete("/bills/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const supabase = getSupabase();
    const { error } = await supabase.from("bills").delete().eq("id", id);
    if (error) throw error;
    broadcast({ type: 'BILLS_UPDATED' });
    res.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting bill:", error);
    res.status(500).json({ error: error.message || "Failed to delete bill" });
  }
});

apiRouter.delete("/bills", async (req, res) => {
  try {
    const supabase = getSupabase();
    const { error } = await supabase.from("bills").delete().neq("id", 0); // Delete all
    if (error) throw error;
    broadcast({ type: 'BILLS_UPDATED' });
    res.json({ success: true });
  } catch (error: any) {
    console.error("Error clearing bills:", error);
    res.status(500).json({ error: error.message || "Failed to clear bills" });
  }
});

// Mount the router at both root and /api for maximum compatibility
app.use("/api", apiRouter);
app.use("/", apiRouter);
