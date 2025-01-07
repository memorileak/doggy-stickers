export interface StickerSet {
  id: number;
  name: string;
  created_at: string;
  sticker_count: number;
}

export interface Sticker {
  id: number;
  set_id: number;
  set_name: string;
  image_path: string;
  tags: string[];
  created_at: string;
}
