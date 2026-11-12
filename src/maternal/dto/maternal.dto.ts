import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import { PartialType } from "@nestjs/swagger";
import {
  AncRiskLevel,
  BabySex,
  BabyStatus,
  DeliveryMode,
  DeliveryPlace,
  FetalMovement,
  FetalPresentation,
  DatingSource,
  LaborOnset,
  LiquorStatus,
  LmpStatus,
  MaternalCondition,
  MembraneStatus,
  PlacentaStatus,
  PostDeliveryDisposition,
  PreviousDeliveryMode,
  ThirdStageManagement,
} from "../../generated/prisma/client";

export class UpsertObstetricHistoryDto {
  @IsOptional() @IsInt() @Min(0) gravidity?: number;
  @IsOptional() @IsInt() @Min(0) term?: number;
  @IsOptional() @IsInt() @Min(0) preterm?: number;
  @IsOptional() @IsInt() @Min(0) abortion?: number;
  @IsOptional() @IsInt() @Min(0) living?: number;
  @IsOptional() @ValidateIf((_, value) => value != null && value !== "") @IsDateString()
  lmp?: string | null;
  @IsOptional() @ValidateIf((_, value) => value != null && value !== "") @IsDateString()
  edd?: string | null;
  @IsOptional() @IsEnum(LmpStatus) lmpStatus?: LmpStatus;
  @IsOptional() @IsEnum(DatingSource) datingSource?: DatingSource;
  @IsOptional() @IsBoolean() datingEstablished?: boolean;
  @IsOptional()
  @IsEnum(PreviousDeliveryMode)
  previousDelivery?: PreviousDeliveryMode;
  @IsOptional() @IsBoolean() previousCs?: boolean;
  @IsOptional() @IsBoolean() previousPph?: boolean;
  @IsOptional() @IsBoolean() previousPetEclampsia?: boolean;
  @IsOptional() @IsBoolean() stillbirth?: boolean;
  @IsOptional() @IsString() otherComplications?: string;
  @IsOptional() @IsString() bloodGroupRh?: string;
  @IsOptional() @IsString() hivStatus?: string;
  @IsOptional() @IsString() syphilisStatus?: string;
  @IsOptional() @IsString() hepatitisBStatus?: string;
  @IsOptional() @IsString() tetanusStatus?: string;
}

export class CreateAncVisitDto {
  @IsOptional() @IsUUID() encounterId?: string;
  @IsOptional() @IsDateString() visitDate?: string;
  @IsOptional() @IsInt() @Min(0) @Max(45) gaWeeks?: number;
  @IsOptional() @IsInt() @Min(0) @Max(6) gaDays?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.2)
  @Max(500)
  weightKg?: number;
  @IsOptional() @IsInt() @Min(40) @Max(300) systolic?: number;
  @IsOptional() @IsInt() @Min(20) @Max(200) diastolic?: number;
  @IsOptional() @IsInt() @Min(20) @Max(250) pulseRate?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(60)
  fundalHeightCm?: number;
  @IsOptional() @IsInt() @Min(40) @Max(250) fetalHeartRate?: number;
  @IsOptional() @IsEnum(FetalPresentation) fetalPresentation?: FetalPresentation;
  @IsOptional() @IsEnum(FetalMovement) fetalMovement?: FetalMovement;
  @IsOptional() @IsBoolean() urineProtein?: boolean;
  @IsOptional() @IsBoolean() urineGlucose?: boolean;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(30)
  hemoglobinGdl?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(600)
  bloodGlucose?: number;
  @IsOptional() @IsEnum(AncRiskLevel) riskAssessment?: AncRiskLevel;
  @IsOptional() @IsString() treatment?: string;
  @IsOptional() @IsString() ultrasoundFindings?: string;
  @IsOptional() @IsDateString() nextAppointment?: string;
}

export class UpdateAncVisitDto extends PartialType(CreateAncVisitDto) {}

export class UpsertLaborAdmissionDto {
  @IsOptional() @IsDateString() admittedAt?: string;
  @IsOptional() @IsInt() @Min(0) @Max(45) gaWeeks?: number;
  @IsOptional() @IsEnum(LaborOnset) onsetOfLabor?: LaborOnset;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(10)
  cervicalDilatationCm?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100) cervicalEffacementPct?: number;
  @IsOptional() @IsEnum(MembraneStatus) membraneStatus?: MembraneStatus;
  @IsOptional() @IsEnum(LiquorStatus) liquor?: LiquorStatus;
  @IsOptional() @IsEnum(FetalPresentation) fetalPresentation?: FetalPresentation;
  @IsOptional() @IsInt() @Min(40) @Max(250) fetalHeartRate?: number;
  @IsOptional() @IsString() contractionsNote?: string;
  @IsOptional() @IsInt() @Min(40) @Max(300) systolic?: number;
  @IsOptional() @IsInt() @Min(20) @Max(200) diastolic?: number;
  @IsOptional() @IsInt() @Min(20) @Max(250) pulseRate?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(30)
  @Max(45)
  temperatureC?: number;
}

export class CreateLaborMonitoringDto {
  @IsOptional() @IsDateString() recordedAt?: string;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(10)
  cervicalDilatationCm?: number;
  @IsOptional() @IsInt() @Min(40) @Max(250) fetalHeartRate?: number;
  @IsOptional() @IsInt() @Min(0) @Max(20) contractionsPer10Min?: number;
  @IsOptional() @IsInt() @Min(0) @Max(120) contractionDurationSec?: number;
  @IsOptional() @IsString() membraneLiquorNote?: string;
  @IsOptional() @IsInt() @Min(0) @Max(5) descentFifths?: number;
  @IsOptional() @IsInt() @Min(40) @Max(300) systolic?: number;
  @IsOptional() @IsInt() @Min(20) @Max(200) diastolic?: number;
  @IsOptional() @IsInt() @Min(20) @Max(250) pulseRate?: number;
  @IsOptional() @IsInt() @Min(0) urineOutputMl?: number;
  @IsOptional() @IsString() medicationNote?: string;
}

export class NewbornDto {
  @IsOptional() @IsInt() @Min(1) birthOrder?: number;
  @IsOptional() @IsEnum(BabySex) sex?: BabySex;
  @IsOptional() @IsInt() @Min(0) birthWeightGrams?: number;
  @IsOptional() @IsInt() @Min(0) @Max(10) apgar1?: number;
  @IsOptional() @IsInt() @Min(0) @Max(10) apgar5?: number;
  @IsOptional() @IsInt() @Min(0) @Max(45) gaWeeks?: number;
  @IsOptional() @IsEnum(BabyStatus) status?: BabyStatus;
  @IsOptional() @IsBoolean() resuscitation?: boolean;
  @IsOptional() @IsBoolean() nicuAdmission?: boolean;
}

export class UpsertDeliverySummaryDto {
  @IsOptional() @IsDateString() deliveredAt?: string;
  @IsOptional() @IsEnum(DeliveryMode) modeOfDelivery?: DeliveryMode;
  @IsOptional() @IsString() csIndication?: string;
  @IsOptional() @IsEnum(DeliveryPlace) placeOfDelivery?: DeliveryPlace;
  @IsOptional() @IsEnum(FetalPresentation) presentation?: FetalPresentation;
  @IsOptional() @IsBoolean() episiotomy?: boolean;
  @IsOptional() @IsString() perinealTearDegree?: string;
  @IsOptional() @IsEnum(PlacentaStatus) placenta?: PlacentaStatus;
  @IsOptional()
  @IsEnum(ThirdStageManagement)
  thirdStageManagement?: ThirdStageManagement;
  @IsOptional() @IsInt() @Min(0) estimatedBloodLossMl?: number;
  @IsOptional() @IsString() complications?: string;
  @IsOptional() @IsEnum(MaternalCondition) maternalCondition?: MaternalCondition;
  @IsOptional() @IsBoolean() pph?: boolean;
  @IsOptional() @IsBoolean() bloodTransfusion?: boolean;
  @IsOptional() @IsString() additionalIntervention?: string;
  @IsOptional() @IsInt() @Min(40) @Max(300) postDeliverySystolic?: number;
  @IsOptional() @IsInt() @Min(20) @Max(200) postDeliveryDiastolic?: number;
  @IsOptional()
  @IsEnum(PostDeliveryDisposition)
  disposition?: PostDeliveryDisposition;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NewbornDto)
  newborns?: NewbornDto[];
}
