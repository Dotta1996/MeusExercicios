package com.meusexercicios.app;

import android.content.Context;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Ponte JS para o WorkoutCountdownTickReceiver: uma notificação de contagem de
 * descanso que se reposta a cada poucos segundos (10s) via AlarmManager nativo
 * — sem nenhum JavaScript envolvido depois do primeiro disparo, então continua
 * funcionando com a tela apagada. Usa uma notificação de texto simples
 * (mesmo formato da notificação "Concluir Série", que já confirmamos que
 * chega no relógio pareado), em vez de recursos nativos mais sofisticados
 * (chronometer / Ongoing Activity) que não estavam sendo espelhados de forma
 * confiável.
 */
@CapacitorPlugin(name = "CountdownNotification")
public class CountdownNotificationPlugin extends Plugin {

    @PluginMethod
    public void show(PluginCall call) {
        Context context = getContext();
        int id = call.getInt("id", 887713);
        String title = call.getString("title", "Descanso");
        Long targetMillisArg = call.getLong("targetMillis");
        long targetMillis = targetMillisArg != null ? targetMillisArg : System.currentTimeMillis() + 60000L;

        WorkoutCountdownTickReceiver.tick(context, id, title, targetMillis);
        call.resolve();
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        int id = call.getInt("id", 887713);
        WorkoutCountdownTickReceiver.cancel(getContext(), id);
        call.resolve();
    }
}
