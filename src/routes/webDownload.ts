import type { FastifyPluginAsync } from 'fastify';
import { webRequestDownload, webGetDownloads, webDeleteDownload } from '../controllers/webDownloadController';
import { SubscriptionPlanModel } from '../models/SubscriptionPlan';
import { SettingsModel } from '../models/Settings';

import { PlanLimitModel } from '../models/PlanLimit';

const webDownloadRoutes: FastifyPluginAsync = async (fastify) => {
  // Public: list active subscription plans — no auth required
  fastify.get('/subscription-plans', async (_request, reply) => {
    try {
      const plans = await SubscriptionPlanModel.find({ status: true })
        .sort({ level: 1, price: 1 })
        .lean();

      const planIds = plans.map((p) => p._id);
      const planLimits = await PlanLimitModel.find({ planId: { $in: planIds } }).lean();
      const limitsMap = new Map(planLimits.map((l) => [l.planId.toString(), l]));
      
      const settings = await SettingsModel.findOne().lean();
      const currencySymbol = settings?.currencySymbol || '₹';

      return reply.send({
        success: true,
        data: plans.map((plan) => {
          const limit = limitsMap.get(plan._id.toString());
          const downloadAllowed = limit ? limit.downloadStatus === true : false;
          return {
            id: plan._id,
            name: plan.name,
            duration: plan.duration,
            durationValue: plan.durationValue,
            price: plan.price,
            discount: plan.discount,
            totalPrice: plan.totalPrice,
            description: plan.description,
            level: plan.level,
            currencySymbol,
            downloadAllowed,
            downloadStatus: downloadAllowed,
            deviceLimitCount: limit?.deviceLimitCount || 1,
            profileLimitCount: limit?.profileLimitCount || 1,
            videoCast: limit?.videoCast || false,
            ads: limit?.ads || false,
          };
        }),
      });
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // JWT-protected routes scoped so the hook doesn't bleed to the public route above
  fastify.register(async (auth) => {
    auth.addHook('onRequest', async (request, reply) => {
      try {
        await request.jwtVerify();
      } catch (err) {
        reply.send(err);
      }
    });

    // POST /api/web/download
    auth.post('/download', webRequestDownload);

    // GET /api/web/downloads
    auth.get('/downloads', webGetDownloads);

    // DELETE /api/web/downloads/:id
    auth.delete('/downloads/:id', webDeleteDownload);
  });
};

export default webDownloadRoutes;
