import { ReviewList } from "@/components/mobile/review-list";

// Kabar terbaru: the user's notifications (doc 18 §12, §17). The Tinjau queue itself lives at /review.
export default function ReviewPage() {
  return <ReviewList />;
}
