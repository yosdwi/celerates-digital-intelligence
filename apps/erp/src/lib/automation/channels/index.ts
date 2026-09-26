import { sendEmail } from "./email";
import { sendWhatsAppNumber, sendWhatsAppGroup } from "./whatsapp";

export type ReminderChannel = "email" | "wa_number" | "wa_group";

export async function sendViaChannel(channel: ReminderChannel, target: string, subject: string, message: string): Promise<void> {
  switch (channel) {
    case "email":
      return sendEmail(target, subject, message);
    case "wa_number":
      return sendWhatsAppNumber(target, message);
    case "wa_group":
      return sendWhatsAppGroup(target, message);
    default:
      throw new Error(`Channel "${channel}" tidak dikenal`);
  }
}
