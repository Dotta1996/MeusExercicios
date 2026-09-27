package com.meusexercicios.app;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import androidx.core.app.NotificationCompat;

/**
 * Reagenda e reposta a notificação de contagem do descanso a cada poucos
 * segundos — tudo via AlarmManager (nativo, funciona com a tela apagada), sem
 * nenhum JavaScript envolvido em nenhum momento da cadeia.
 *
 * Motivo de existir: os recursos "chronometer"/"Ongoing Activity" (que
 * atualizam sozinhos, sem repostar) não estavam sendo espelhados de forma
 * confiável pro relógio Wear OS pareado. Uma notificação de texto simples,
 * reenviada periodicamente, é o formato que já confirmamos que chega lá (é o
 * mesmo tipo da notificação "Concluir Série").
 */
public class WorkoutCountdownTickReceiver extends BroadcastReceiver {

    static final String CHANNEL_ID = "workout-rest-countdown-v3";
    // Descanso é um período curto (segundos a poucos minutos), então atualizar
    // a cada segundo aqui não esbarra nos limites de frequência que o Android
    // impõe pra alarmes de longa duração (aqueles valem pra uso contínuo por
    // horas, não é o nosso caso).
    static final long TICK_INTERVAL_MS = 1000L;

    static final String EXTRA_ID = "id";
    static final String EXTRA_TITLE = "title";
    static final String EXTRA_TARGET_MILLIS = "targetMillis";

    @Override
    public void onReceive(Context context, Intent intent) {
        int id = intent.getIntExtra(EXTRA_ID, 887713);
        String title = intent.getStringExtra(EXTRA_TITLE);
        long targetMillis = intent.getLongExtra(EXTRA_TARGET_MILLIS, System.currentTimeMillis());
        tick(context, id, title, targetMillis);
    }

    static void tick(Context context, int id, String title, long targetMillis) {
        ensureChannel(context);
        long remainingMs = targetMillis - System.currentTimeMillis();

        if (remainingMs <= 0) {
            // A notificação acionável (com os botões) já assume o lugar dela
            // nesse exato horário — ver services/nativeNotifications.ts.
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.cancel(id);
            return;
        }

        postNotification(context, id, title, remainingMs);

        long nextDelay = Math.min(TICK_INTERVAL_MS, remainingMs);
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am != null) {
            try {
                am.setExactAndAllowWhileIdle(
                    AlarmManager.RTC_WAKEUP,
                    System.currentTimeMillis() + nextDelay,
                    buildPendingIntent(context, id, title, targetMillis)
                );
            } catch (SecurityException e) {
                // Permissão de alarme exato não concedida — sem mais o que fazer aqui.
            }
        }
    }

    static void cancel(Context context, int id) {
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(id);

        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am != null) {
            am.cancel(buildPendingIntent(context, id, null, 0));
        }
    }

    private static void postNotification(Context context, int id, String title, long remainingMs) {
        long remainingSecs = Math.max(0, (remainingMs + 999) / 1000);
        long mins = remainingSecs / 60;
        long secs = remainingSecs % 60;
        String countdown = String.format("%d:%02d", mins, secs);

        Intent openIntent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        PendingIntent contentIntent = openIntent == null ? null : PendingIntent.getActivity(context, id, openIntent, flags);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_notify)
            .setContentTitle("⏱️ Descanso: " + countdown)
            .setContentText(title == null ? "Descansando…" : title)
            .setOnlyAlertOnce(true)
            .setAutoCancel(false)
            .setOngoing(false)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setCategory(NotificationCompat.CATEGORY_WORKOUT)
            .setTimeoutAfter(remainingMs + 2000L);

        if (contentIntent != null) {
            builder.setContentIntent(contentIntent);
        }

        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) {
            nm.notify(id, builder.build());
        }
    }

    private static PendingIntent buildPendingIntent(Context context, int id, String title, long targetMillis) {
        Intent intent = new Intent(context, WorkoutCountdownTickReceiver.class);
        intent.putExtra(EXTRA_ID, id);
        intent.putExtra(EXTRA_TITLE, title);
        intent.putExtra(EXTRA_TARGET_MILLIS, targetMillis);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getBroadcast(context, id, intent, flags);
    }

    private static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null && nm.getNotificationChannel(CHANNEL_ID) == null) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Contagem de Descanso",
                NotificationManager.IMPORTANCE_DEFAULT
            );
            channel.setDescription("Mostra quanto falta para o fim do descanso, inclusive no relógio");
            channel.setShowBadge(false);
            nm.createNotificationChannel(channel);
        }
    }
}
