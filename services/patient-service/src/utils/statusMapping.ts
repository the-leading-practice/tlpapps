
export type AppointmentStatus = "new" | "confirmed" | "cancelled" | "showed" | "noshow" | "invalid";
export interface MappingEntry {
  status: string;
  ghlValue: AppointmentStatus;
}

export interface StatusMapping {
  default: MappingEntry;
  entries: MappingEntry[];
}

export const ChrioTouchMapping: StatusMapping = {
  default: {
    status: "",
    ghlValue: "new"
  },
  entries: [
    {
      status: "1004",
      ghlValue: "confirmed"
    },
    {
      status: "1001",
      ghlValue: "cancelled"
    },
    {
      status: "1006",
      ghlValue: "cancelled"
    },
    {
      status: "1002",
      ghlValue: "showed"
    },
    {
      status: "1003",
      ghlValue: "showed"
    },
    {
      status: "1007",
      ghlValue: "noshow"
    },
    {
      status: "1008",
      ghlValue: "invalid"
    }
  ]
}