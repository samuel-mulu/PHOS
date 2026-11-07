-- Maternal health + family planning registers, triage MCH/FP flags.

ALTER TABLE "triages" ADD COLUMN IF NOT EXISTS "pregnancy_suspected" BOOLEAN;
ALTER TABLE "triages" ADD COLUMN IF NOT EXISTS "mch_needed" BOOLEAN;
ALTER TABLE "triages" ADD COLUMN IF NOT EXISTS "fp_needed" BOOLEAN;

DO $$ BEGIN CREATE TYPE "PreviousDeliveryMode" AS ENUM ('SVD', 'CS', 'INSTRUMENTAL'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "FetalPresentation" AS ENUM ('CEPHALIC', 'BREECH', 'TRANSVERSE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "FetalMovement" AS ENUM ('PRESENT', 'ABSENT'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "AncRiskLevel" AS ENUM ('LOW', 'HIGH'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "LaborOnset" AS ENUM ('SPONTANEOUS', 'INDUCED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "MembraneStatus" AS ENUM ('INTACT', 'RUPTURED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "LiquorStatus" AS ENUM ('CLEAR', 'MECONIUM', 'BLOOD_STAINED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "DeliveryMode" AS ENUM ('SVD', 'CS', 'ASSISTED_VAGINAL'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "DeliveryPlace" AS ENUM ('CLINIC', 'REFERRAL'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "PlacentaStatus" AS ENUM ('COMPLETE', 'INCOMPLETE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ThirdStageManagement" AS ENUM ('ACTIVE', 'PHYSIOLOGICAL'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "BabySex" AS ENUM ('MALE', 'FEMALE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "BabyStatus" AS ENUM ('ALIVE', 'STILLBIRTH'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "MaternalCondition" AS ENUM ('STABLE', 'UNSTABLE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "PostDeliveryDisposition" AS ENUM ('POSTNATAL_WARD', 'REFERRAL', 'OTHER'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "FpVisitType" AS ENUM ('NEW', 'RETURNING', 'SWITCHING', 'FOLLOW_UP'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ContraceptiveMethod" AS ENUM ('IUCD', 'IMPLANT', 'INJECTABLE_DMPA', 'COC', 'POP', 'CONDOM_MALE', 'CONDOM_FEMALE', 'EMERGENCY', 'NATURAL', 'LAM', 'TUBAL_LIGATION', 'VASECTOMY', 'OTHER'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "FpOutcome" AS ENUM ('CONTINUE', 'DISCONTINUE', 'REMOVE', 'SWITCH'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "obstetric_histories" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "gravidity" INTEGER,
    "term" INTEGER,
    "preterm" INTEGER,
    "abortion" INTEGER,
    "living" INTEGER,
    "lmp" DATE,
    "edd" DATE,
    "previous_delivery" "PreviousDeliveryMode",
    "previous_cs" BOOLEAN,
    "previous_pph" BOOLEAN,
    "previous_pet_eclampsia" BOOLEAN,
    "stillbirth" BOOLEAN,
    "other_complications" TEXT,
    "blood_group_rh" TEXT,
    "hiv_status" TEXT,
    "syphilis_status" TEXT,
    "hepatitis_b_status" TEXT,
    "tetanus_status" TEXT,
    "recorded_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "obstetric_histories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "obstetric_histories_patient_id_key" ON "obstetric_histories"("patient_id");

CREATE TABLE IF NOT EXISTS "anc_visits" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "encounter_id" UUID,
    "visit_number" INTEGER NOT NULL,
    "visit_date" DATE NOT NULL,
    "ga_weeks" INTEGER,
    "ga_days" INTEGER,
    "weight_kg" DECIMAL(5,2),
    "systolic" INTEGER,
    "diastolic" INTEGER,
    "pulse_rate" INTEGER,
    "fundal_height_cm" DECIMAL(4,1),
    "fetal_heart_rate" INTEGER,
    "fetal_presentation" "FetalPresentation",
    "fetal_movement" "FetalMovement",
    "urine_protein" BOOLEAN,
    "urine_glucose" BOOLEAN,
    "hemoglobin_gdl" DECIMAL(4,1),
    "blood_glucose" DECIMAL(6,1),
    "risk_assessment" "AncRiskLevel",
    "treatment" TEXT,
    "ultrasound_findings" TEXT,
    "next_appointment" DATE,
    "recorded_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "anc_visits_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "anc_visits_patient_id_visit_number_key" ON "anc_visits"("patient_id", "visit_number");
CREATE INDEX IF NOT EXISTS "anc_visits_patient_id_visit_date_idx" ON "anc_visits"("patient_id", "visit_date");
CREATE INDEX IF NOT EXISTS "anc_visits_encounter_id_idx" ON "anc_visits"("encounter_id");

CREATE TABLE IF NOT EXISTS "labor_admissions" (
    "id" UUID NOT NULL,
    "encounter_id" UUID NOT NULL,
    "admitted_at" TIMESTAMP(3) NOT NULL,
    "ga_weeks" INTEGER,
    "onset_of_labor" "LaborOnset",
    "cervical_dilatation_cm" DECIMAL(3,1),
    "cervical_effacement_pct" INTEGER,
    "membrane_status" "MembraneStatus",
    "liquor" "LiquorStatus",
    "fetal_presentation" "FetalPresentation",
    "fetal_heart_rate" INTEGER,
    "contractions_note" TEXT,
    "systolic" INTEGER,
    "diastolic" INTEGER,
    "pulse_rate" INTEGER,
    "temperature_c" DECIMAL(4,1),
    "recorded_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "labor_admissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "labor_admissions_encounter_id_key" ON "labor_admissions"("encounter_id");

CREATE TABLE IF NOT EXISTS "labor_monitoring_entries" (
    "id" UUID NOT NULL,
    "labor_admission_id" UUID NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL,
    "cervical_dilatation_cm" DECIMAL(3,1),
    "fetal_heart_rate" INTEGER,
    "contractions_per_10_min" INTEGER,
    "contraction_duration_sec" INTEGER,
    "membrane_liquor_note" TEXT,
    "descent_fifths" INTEGER,
    "systolic" INTEGER,
    "diastolic" INTEGER,
    "pulse_rate" INTEGER,
    "urine_output_ml" INTEGER,
    "medication_note" TEXT,
    "recorded_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "labor_monitoring_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "labor_monitoring_entries_labor_admission_id_recorded_at_idx" ON "labor_monitoring_entries"("labor_admission_id", "recorded_at");

CREATE TABLE IF NOT EXISTS "delivery_summaries" (
    "id" UUID NOT NULL,
    "encounter_id" UUID NOT NULL,
    "delivered_at" TIMESTAMP(3),
    "mode_of_delivery" "DeliveryMode",
    "cs_indication" TEXT,
    "place_of_delivery" "DeliveryPlace",
    "presentation" "FetalPresentation",
    "episiotomy" BOOLEAN,
    "perineal_tear_degree" TEXT,
    "placenta" "PlacentaStatus",
    "third_stage_management" "ThirdStageManagement",
    "estimated_blood_loss_ml" INTEGER,
    "complications" TEXT,
    "maternal_condition" "MaternalCondition",
    "pph" BOOLEAN,
    "blood_transfusion" BOOLEAN,
    "additional_intervention" TEXT,
    "post_delivery_systolic" INTEGER,
    "post_delivery_diastolic" INTEGER,
    "disposition" "PostDeliveryDisposition",
    "recorded_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "delivery_summaries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "delivery_summaries_encounter_id_key" ON "delivery_summaries"("encounter_id");

CREATE TABLE IF NOT EXISTS "newborn_records" (
    "id" UUID NOT NULL,
    "delivery_summary_id" UUID NOT NULL,
    "birth_order" INTEGER NOT NULL DEFAULT 1,
    "sex" "BabySex",
    "birth_weight_grams" INTEGER,
    "apgar_1" INTEGER,
    "apgar_5" INTEGER,
    "ga_weeks" INTEGER,
    "status" "BabyStatus",
    "resuscitation" BOOLEAN,
    "nicu_admission" BOOLEAN,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "newborn_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "newborn_records_delivery_summary_id_idx" ON "newborn_records"("delivery_summary_id");

CREATE TABLE IF NOT EXISTS "family_planning_records" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "encounter_id" UUID,
    "visit_type" "FpVisitType",
    "gravidity" INTEGER,
    "parity" INTEGER,
    "living_children" INTEGER,
    "previous_method" "ContraceptiveMethod",
    "current_method" "ContraceptiveMethod",
    "pregnancy_status" TEXT,
    "systolic" INTEGER,
    "diastolic" INTEGER,
    "contraindications" TEXT,
    "counseling_done" BOOLEAN,
    "counseling_notes" TEXT,
    "procedure_date" DATE,
    "side_effects" TEXT,
    "next_appointment" DATE,
    "outcome" "FpOutcome",
    "recorded_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "family_planning_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "family_planning_records_patient_id_created_at_idx" ON "family_planning_records"("patient_id", "created_at");
CREATE INDEX IF NOT EXISTS "family_planning_records_encounter_id_idx" ON "family_planning_records"("encounter_id");

DO $$ BEGIN ALTER TABLE "obstetric_histories" ADD CONSTRAINT "obstetric_histories_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "obstetric_histories" ADD CONSTRAINT "obstetric_histories_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "anc_visits" ADD CONSTRAINT "anc_visits_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "anc_visits" ADD CONSTRAINT "anc_visits_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "anc_visits" ADD CONSTRAINT "anc_visits_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "labor_admissions" ADD CONSTRAINT "labor_admissions_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "labor_admissions" ADD CONSTRAINT "labor_admissions_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "labor_monitoring_entries" ADD CONSTRAINT "labor_monitoring_entries_labor_admission_id_fkey" FOREIGN KEY ("labor_admission_id") REFERENCES "labor_admissions"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "labor_monitoring_entries" ADD CONSTRAINT "labor_monitoring_entries_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "delivery_summaries" ADD CONSTRAINT "delivery_summaries_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "delivery_summaries" ADD CONSTRAINT "delivery_summaries_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "newborn_records" ADD CONSTRAINT "newborn_records_delivery_summary_id_fkey" FOREIGN KEY ("delivery_summary_id") REFERENCES "delivery_summaries"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "family_planning_records" ADD CONSTRAINT "family_planning_records_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "family_planning_records" ADD CONSTRAINT "family_planning_records_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "family_planning_records" ADD CONSTRAINT "family_planning_records_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
