-- Mid-visit cashier payment: remember which station to return the patient to.
ALTER TABLE "encounters"
ADD COLUMN IF NOT EXISTS "payment_return_station" "QueueStation";
