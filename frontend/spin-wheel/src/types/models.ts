export type Wheel = {
  id: string;
  owner_id: string;
  status: "CREATED" | "OPEN" | "STARTING" | "RUNNING" | "ABORTED" | "COMPLETED";
  entry_fee: string;
  min_participants: number;
  auto_start_at: string;
  started_at: string | null;
  ended_at: string | null;
  winner_pool: string;
  admin_pool: string;
  app_pool: string;
  winner_id: string | null;
};

export type Participant = {
  user_id: string;
  username: string;
  status: "JOINED" | "ELIMINATED" | "WINNER" | "REFUNDED";
  joined_at: string;
  eliminated_at: string | null;
};

export type ActiveWheelResponse = {
  wheel: Wheel | null;
};

export type WheelDetails = {
  wheel: Wheel;
  participants: Participant[];
};

export type CreateWheelResponse = {
  wheel: Wheel;
};

export type JoinWheelResponse = {
  wheelId: string;
  userId: string;
  entryFee: string | number;
  pools: { winner_pool: string | number; admin_pool: string | number; app_pool: string | number };
};