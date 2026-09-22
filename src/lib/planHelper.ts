import mongoose from 'mongoose';
import { SubscriptionPlanModel, ISubscriptionPlan } from '../models/SubscriptionPlan';
import { PlanLimitModel, IPlanLimit } from '../models/PlanLimit';

function escapeRegex(text: string): string {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

export interface UserPlanResolution {
  isActive: boolean;
  plan: ISubscriptionPlan | null;
  limit: IPlanLimit | null;
  downloadAllowed: boolean;
  profileLimitCount: number;
  deviceLimitCount: number;
  ads: boolean;
  videoCast: boolean;
}

export async function resolveUserPlanAndLimits(user: {
  subscriptionPlan?: string | null;
  subscriptionPlanId?: mongoose.Types.ObjectId | string | null;
  subscriptionStatus?: string | null;
  subscriptionExpiry?: Date | string | null;
}): Promise<UserPlanResolution> {
  const isActive =
    user.subscriptionStatus === 'active' &&
    (!user.subscriptionExpiry || new Date(user.subscriptionExpiry) > new Date());

  const planKey = (user.subscriptionPlan || 'free').toString().trim();

  if (!isActive || planKey.toLowerCase() === 'free') {
    return {
      isActive: false,
      plan: null,
      limit: null,
      downloadAllowed: false,
      profileLimitCount: 1,
      deviceLimitCount: 1,
      ads: false,
      videoCast: false,
    };
  }

  let plan: ISubscriptionPlan | null = null;

  // 1. Check explicit subscriptionPlanId
  if (user.subscriptionPlanId && mongoose.Types.ObjectId.isValid(String(user.subscriptionPlanId))) {
    plan = await SubscriptionPlanModel.findById(user.subscriptionPlanId).lean();
  }

  // 2. Check if planKey is an ObjectId
  if (!plan && mongoose.Types.ObjectId.isValid(planKey)) {
    plan = await SubscriptionPlanModel.findById(planKey).lean();
  }

  // 3. Match by standard level names: basic (1), standard (2), premium (3)
  if (!plan) {
    const levelMap: Record<string, number> = {
      basic: 1,
      standard: 2,
      premium: 3,
    };
    const normalized = planKey.toLowerCase();
    const matchedLevel = levelMap[normalized];
    if (matchedLevel !== undefined) {
      plan =
        (await SubscriptionPlanModel.findOne({ level: matchedLevel, status: true }).lean()) ||
        (await SubscriptionPlanModel.findOne({ level: matchedLevel }).lean());
    }
  }

  // 4. Match by name case-insensitively (exact match first, then prefix/contains)
  if (!plan) {
    const escaped = escapeRegex(planKey);
    plan =
      (await SubscriptionPlanModel.findOne({
        name: { $regex: new RegExp(`^${escaped}$`, 'i') },
        status: true,
      }).lean()) ||
      (await SubscriptionPlanModel.findOne({
        name: { $regex: new RegExp(`^${escaped}$`, 'i') },
      }).lean());

    if (!plan) {
      plan =
        (await SubscriptionPlanModel.findOne({
          name: { $regex: new RegExp(escaped, 'i') },
          status: true,
        }).lean()) ||
        (await SubscriptionPlanModel.findOne({
          name: { $regex: new RegExp(escaped, 'i') },
        }).lean());
    }
  }

  let limit: IPlanLimit | null = null;
  if (plan) {
    limit = await PlanLimitModel.findOne({ planId: plan._id }).lean();
  }

  const downloadAllowed = limit ? limit.downloadStatus === true : false;
  const profileLimitCount = limit?.profileLimitCount || 1;
  const deviceLimitCount = limit?.deviceLimitCount || 1;
  const ads = limit?.ads ?? false;
  const videoCast = limit?.videoCast ?? false;

  return {
    isActive,
    plan,
    limit,
    downloadAllowed,
    profileLimitCount,
    deviceLimitCount,
    ads,
    videoCast,
  };
}
