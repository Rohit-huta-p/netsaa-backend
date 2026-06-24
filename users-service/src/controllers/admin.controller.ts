import { Request, Response } from 'express';
import mongoose from 'mongoose';

const safeDelete = async (collection: string, query: any): Promise<number> => {
  try {
    const db = mongoose.connection.db;
    if (!db) return 0;
    const r = await db.collection(collection).deleteMany(query);
    return r.deletedCount || 0;
  } catch (e: any) {
    if (e.codeName === 'NamespaceNotFound') return 0;
    return 0;
  }
};

export const listUsers = async (req: Request, res: Response) => {
  try {
    const db = mongoose.connection.db;
    if (!db) return res.status(500).json({ success: false, message: 'No DB' });
    const q = (req.query.q as string)?.trim();
    const filter: any = {};
    if (q) {
      filter.$or = [
        { displayName: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } },
        { phone: { $regex: q, $options: 'i' } },
      ];
    }
    const users = await db
      .collection('users')
      .find(filter, { projection: { displayName: 1, email: 1, phone: 1, accountStatus: 1, createdAt: 1, role: 1 } })
      .sort({ createdAt: -1 })
      .limit(200)
      .toArray();
    res.json({ success: true, count: users.length, users });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message });
  }
};

export const listGigs = async (req: Request, res: Response) => {
  try {
    const db = mongoose.connection.db;
    if (!db) return res.status(500).json({ success: false, message: 'No DB' });
    const q = (req.query.q as string)?.trim();
    const filter: any = {};
    if (q) {
      filter.$or = [
        { title: { $regex: q, $options: 'i' } },
        { 'organizerSnapshot.displayName': { $regex: q, $options: 'i' } },
      ];
    }
    const gigs = await db
      .collection('gigs')
      .find(filter, { projection: { title: 1, organizerId: 1, 'organizerSnapshot.displayName': 1, status: 1, createdAt: 1, 'location.city': 1 } })
      .sort({ createdAt: -1 })
      .limit(200)
      .toArray();
    res.json({ success: true, count: gigs.length, gigs });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message });
  }
};

export const deleteUser = async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: 'Invalid user id' });
  }
  const uid = new mongoose.Types.ObjectId(id);
  const report: Record<string, number> = {};

  try {
    const db = mongoose.connection.db;
    if (!db) return res.status(500).json({ success: false, message: 'No DB' });

    // Snapshot user (for phone/email lookups before deletion)
    const userDoc = await db.collection('users').findOne({ _id: uid });
    const phone = userDoc?.phone as string | undefined;
    const email = userDoc?.email as string | undefined;

    // === Profiles ===
    report.users = await safeDelete('users', { _id: uid });
    report.artists = await safeDelete('artists', { userId: uid });
    report.organizers = await safeDelete('organizers', { userId: uid });
    report.hirerprofiles = await safeDelete('hirerprofiles', { userId: uid });

    // === Connections (requesterId / recipientId) ===
    report.connections = await safeDelete('connections', {
      $or: [{ requesterId: uid }, { recipientId: uid }],
    });

    // === Conversations + Messages ===
    const convos = await db.collection('conversations').find({ participants: uid }).toArray();
    const convoIds = convos.map((c) => c._id);
    if (convoIds.length) {
      report.messages = await safeDelete('messages', { conversationId: { $in: convoIds } });
      report.conversations = await safeDelete('conversations', { _id: { $in: convoIds } });
    } else {
      report.messages = 0;
      report.conversations = 0;
    }
    report.strayMessages = await safeDelete('messages', { senderId: uid });

    // === Notifications (userId = recipient, actorId = trigger) ===
    report.notifications = await safeDelete('notifications', {
      $or: [{ userId: uid }, { actorId: uid }],
    });

    // === Events organized by user ===
    const events = await db.collection('events').find({ organizer: uid }, { projection: { _id: 1 } }).toArray();
    const eventIds = events.map((e) => e._id);
    report.events = await safeDelete('events', { organizer: uid });
    if (eventIds.length) {
      report.eventcomments_byEvent = await safeDelete('eventcomments', { event: { $in: eventIds } });
      report.eventregistrations_byEvent = await safeDelete('eventregistrations', { event: { $in: eventIds } });
      report.eventreservations_byEvent = await safeDelete('eventreservations', { event: { $in: eventIds } });
      report.savedevents_byEvent = await safeDelete('savedevents', { event: { $in: eventIds } });
      report.eventstats_byEvent = await safeDelete('eventstats', { eventId: { $in: eventIds } });
      report.eventtickets_byEvent = await safeDelete('eventtickets', { eventId: { $in: eventIds } });
      report.eventtickettypes_byEvent = await safeDelete('eventtickettypes', { eventId: { $in: eventIds } });
    }
    // Event participation by user
    report.eventcomments_user = await safeDelete('eventcomments', { user: uid });
    report.eventregistrations_user = await safeDelete('eventregistrations', { user: uid });
    report.eventreservations_user = await safeDelete('eventreservations', { user: uid });
    report.savedevents_user = await safeDelete('savedevents', { user: uid });
    report.eventtickets_user = await safeDelete('eventtickets', { userId: uid });

    // === Gigs organized by user ===
    const gigs = await db
      .collection('gigs')
      .find({ $or: [{ organizerId: uid }, { organizer: uid }] }, { projection: { _id: 1 } })
      .toArray();
    const gigIds = gigs.map((g) => g._id);
    report.gigs = await safeDelete('gigs', { $or: [{ organizerId: uid }, { organizer: uid }] });
    if (gigIds.length) {
      report.gigcomments_byGig = await safeDelete('gigcomments', { gig: { $in: gigIds } });
      report.gigapplications_byGig = await safeDelete('gigapplications', { gig: { $in: gigIds } });
      report.savedgigs_byGig = await safeDelete('savedgigs', { gig: { $in: gigIds } });
      report.gigstats_byGig = await safeDelete('gigstats', { gigId: { $in: gigIds } });
    }
    report.gigapplications_user = await safeDelete('gigapplications', { artist: uid });
    report.gigcomments_user = await safeDelete('gigcomments', { user: uid });
    report.savedgigs_user = await safeDelete('savedgigs', { user: uid });

    // === Payments: contracts + transactions ===
    report.contracts = await safeDelete('contracts', {
      $or: [
        { hirerId: uid },
        { artistId: uid },
        { requestedBy: uid },
        { respondedBy: uid },
        { coSignedForUserId: uid },
      ],
    });
    report.transactions = await safeDelete('transactions', {
      $or: [
        { fromUserId: uid },
        { toUserId: uid },
        { recordedBy: uid },
        { 'dispute.openedBy': uid },
        { 'dispute.resolvedBy': uid },
      ],
    });

    // === Support ===
    const tickets = await db.collection('supporttickets').find({ user: uid }, { projection: { _id: 1 } }).toArray();
    const ticketIds = tickets.map((t) => t._id);
    if (ticketIds.length) {
      report.supportmessages_byTicket = await safeDelete('supportmessages', { ticket: { $in: ticketIds } });
      report.supportescalations_byTicket = await safeDelete('supportescalations', { ticket: { $in: ticketIds } });
      report.supporttickets = await safeDelete('supporttickets', { _id: { $in: ticketIds } });
    } else {
      report.supporttickets = 0;
    }
    report.supportmessages_sender = await safeDelete('supportmessages', { sender: uid });

    // === Auth sessions (best-effort cleanup by phone/email) ===
    if (phone) {
      report.otpsessions = await safeDelete('otpsessions', { phone });
    }
    if (email) {
      report.passwordresetsessions = await safeDelete('passwordresetsessions', { email });
    }

    const total = Object.values(report).reduce((a, b) => a + b, 0);
    res.json({ success: true, userId: id, total, report });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message, report });
  }
};

export const deleteGig = async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ success: false, message: 'Invalid gig id' });
  }
  const gid = new mongoose.Types.ObjectId(id);
  const report: Record<string, number> = {};

  try {
    report.gigcomments = await safeDelete('gigcomments', { gig: gid });
    report.gigapplications = await safeDelete('gigapplications', { gig: gid });
    report.savedgigs = await safeDelete('savedgigs', { gig: gid });
    report.gigstats = await safeDelete('gigstats', { gigId: gid });
    report.contracts = await safeDelete('contracts', { gigId: gid });
    report.transactions = await safeDelete('transactions', { gigId: gid });
    report.notifications = await safeDelete('notifications', { entityType: 'gig', entityId: gid });
    report.gigs = await safeDelete('gigs', { _id: gid });
    const total = Object.values(report).reduce((a, b) => a + b, 0);
    res.json({ success: true, gigId: id, total, report });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message, report });
  }
};
