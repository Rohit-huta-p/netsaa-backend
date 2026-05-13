import dotenv from 'dotenv';
dotenv.config();
import connectDB from './config/db';
import app from './app';
import { startReservationExpiryWorker } from './workers/reservationExpiryWorker';
import { startReconciliationWorker } from './workers/reconciliation.worker';
import { startReminderWorkers } from './workers/reminders.worker';
import { startCapacityUrgencyWorker } from './workers/capacityUrgency.worker';

connectDB();

const PORT = process.env.PORT || 5003;

app.listen(PORT, () => {
    console.log(`Events service running on port ${PORT}`);
    startReservationExpiryWorker();
    if (process.env.NODE_ENV !== 'test') {
        startReconciliationWorker();
        startReminderWorkers();
        startCapacityUrgencyWorker();
    }
});
