export interface BlogFormData {
  blog_id: string;
  blog_title: string;
  blog_text: string;
  blog_thumbnail: string;
  blog_tags: string[];
  blog_schedule_at: string;
}

export interface BlogScheduleItem {
  blog_schedule_id: string;
  blog_id?: string;
  blog_title: string;
  blog_text: string;
  blog_thumbnail: string;
  blog_tags: string[];
  blog_schedule_at: string;
}
