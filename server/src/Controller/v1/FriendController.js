const ApiController = require('./ApiController');
const Db = require('../../../libary/sqlBulider');
const ApiError = require('../../Exceptions/ApiError');
const app = require('../../../libary/CommanMethod');
const { lang, Constants } = require('../../../config');
let apis = new ApiController();
let DB = new Db();

module.exports = {
	follow: async (Request) => {
		const required = {
			friend_id: Request.body.friend_id,
			user_id: Request.body.user_id
		};
		const requestData = await apis.vaildation(required, {});
		const user_info = await DB.find('users', 'first', {
			conditions: {
				'users.id': requestData.friend_id
			},
			join: [ 'user_auths on users.id = user_auths.user_id' ],
			fields: [ 'users.id as user_id', 'is_private' ]
		});
		if (!user_info) throw new ApiError(lang[Request.lang].userNotFound, 404);
		if (user_info.is_private) requestData.is_request = 1;
		const friendRequest = await DB.find('friends', 'first', {
			conditions: {
				user_id: requestData.user_id,
				friend_id: requestData.friend_id,
				is_request: 1
			}
		});
		let message = '';
		if (friendRequest) {
			await DB.first(`delete from friends where id = ${friendRequest.id}`);
			message = 'unfollow users successfully';
		} else {
			await DB.save('friends', requestData);
			sendPush(user_info, 'start following you', 5);
			message = 'Follow successfully';
		}
		return {
			message,
			data: []
		};
	},
	rejectRequest: async (Request) => {
		const { friend_id } = Request.body;
		const checkPost = await DB.find('friends', 'first', {
			conditions: {
				friend_id: Request.body.user_id,
				user_id: friend_id,
				is_request: 1
			}
		});
		if (!checkPost) {
			throw new ApiError(lang[Request.lang].wrongRequest, 422);
		}
		await DB.first(`delete from friends where id = ${checkPost.id}`);
		return {
			message: lang[Request.lang].cancelRequest,
			data: []
		};
	},
	unFriend: async (Request) => {
		const { friend_id } = Request.body;
		const user_id = Request.body.user_id;
		const checkPost = await DB.find('friends', 'first', {
			conditions: {
				friend_id: Request.body.user_id,
				user_id: friend_id,
				is_request: 0
			}
		});
		if (!checkPost) {
			throw new ApiError(lang[Request.lang].wrongRequest, 422);
		}
		await DB.first(
			`delete from friends where (user_id = ${friend_id} and friend_id = ${user_id}) or (user_id = ${user_id} and friend_id = ${friend_id})`
		);
		return {
			message: lang[Request.lang].unFriend,
			data: []
		};
	},
	acceptRequest: async (Request) => {
		const required = {
			friend_id: Request.body.friend_id,
			user_id: Request.body.user_id
		};
		const requestData = await apis.vaildation(required, {});
		const { user_id, friend_id } = requestData;
		const user_info = await DB.find('users', 'first', {
			conditions: {
				'users.id': requestData.friend_id
			},
			join: [ 'user_auths on users.id = user_auths.user_id' ],
			fields: [ 'users.id as user_id' ]
		});
		if (!user_info) throw new ApiError(lang[Request.lang].userNotFound, 404);
		const checkPost = await DB.find('friends', 'first', {
			conditions: {
				friend_id: user_id,
				user_id: friend_id,
				is_request: 1
			}
		});
		if (!checkPost) {
			throw new ApiError(lang[Request.lang].wrongRequest, 422);
		}
		checkPost.is_request = 0;
		await DB.save('friends', checkPost);
		const { first_name, last_name } = Request.body.userInfo;
		DB.save('notifications', {
			user_id: requestData.friend_id,
			friend_id: requestData.user_id,
			type: 3,
			text: `${first_name} ${last_name} Accept your request`
		});
		sendPush(user_info, 'Request Accepted', 6);
		return {
			message: lang[Request.lang].acceptRequest,
			data: []
		};
	},
	friendRequestList: async (Request) => {
		const { user_id } = Request.body;
		let offset = Request.params.offset || 1;
		const limit = Request.query.limit || 10;
		const search = Request.query.search || '';
		const filter = Request.query.filter || false;
		offset = (offset - 1) * limit;
		const condition = {
			conditions: {
				friend_id: user_id,
				is_request: 1
			},
			join: [ 'users on users.id = friends.user_id' ],
			fields: [
				'users.id',
				'first_name',
				'last_name',
				'status',
				'email',
				'phone',
				'cover_pic',
				'about_us',
				'profile',
				`(select count(id) from friends where user_id=${user_id} and friend_id=users.id) as i_follow`,
				`(select count(id) from friends where user_id=${user_id} and friend_id=users.id and is_request=1) as i_request`,
				`(select count(id) from friends where friend_id=${user_id} and user_id=users.id and is_request=1) as is_request`,
				`(select count(id) from friends where friend_id=${user_id} and user_id=users.id) as is_follow`
			],
			limit: [ offset, limit ],
			orderBy: [ 'friends.id desc' ]
		};
		if (search) {
			condition.conditions['like'] = {
				first_name: search,
				last_name: search
			};
		}
		if (JSON.parse(filter)) {
			const searchParameter = Constants.UserSearch;
			searchParameter.forEach((value) => {
				if (Request.query.hasOwnProperty(value)) {
					if (Request.query[value]) {
						condition.conditions[value] = Request.query[value];
					}
				}
			});
		}
		const user_info = await DB.find('friends', 'all', condition);
		return {
			message: lang[Request.lang].requestList,
			data: {
				pagination: await apis.Paginations('friends', condition, offset, limit),
				result: app.addUrl(user_info, [ 'profile', 'cover_pic' ])
			}
		};
	},
	friends: async (Request) => {
		const { user_id } = Request.body;
		let offset = Request.params.offset || 1;
		const limit = Request.query.limit || 10;
		const search = Request.query.search || '';
		offset = (offset - 1) * limit;
		const filter = Request.query.filter || false;
		const condition = {
			conditions: {
				friend_id: user_id,
				is_request: 0
			},
			join: [ 'users on users.id = friends.user_id' ],
			fields: [
				'users.id',
				'first_name',
				'last_name',
				'status',
				'email',
				'phone',
				'cover_pic',
				'about_us',
				'profile',
				'user_type',
				`(select count(id) from friends where user_id=${user_id} and friend_id=users.id) as i_follow`,
				`(select count(id) from friends where user_id=${user_id} and friend_id=users.id and is_request=1) as i_request`,
				`(select count(id) from friends where friend_id=${user_id} and user_id=users.id and is_request=1) as is_request`,
				`(select count(id) from friends where friend_id=${user_id} and user_id=users.id) as is_follow`
			],
			limit: [ offset, limit ],
			orderBy: [ 'users.first_name desc' ]
		};
		if (search) {
			condition.conditions['like'] = {
				first_name: search,
				last_name: search
			};
		}
		if (JSON.parse(filter)) {
			const searchParameter = Constants.UserSearch;
			searchParameter.forEach((value) => {
				if (Request.query.hasOwnProperty(value)) {
					if (Request.query[value]) {
						condition.conditions[value] = Request.query[value];
					}
				}
			});
		}
		const user_info = await DB.find('friends', 'all', condition);
		return {
			message: lang[Request.lang].friendList,
			data: {
				pagination: await apis.Paginations('friends', condition, offset, limit),
				result: app.addUrl(user_info, [ 'profile', 'cover_pic' ])
			}
		};
	}
};

const sendPush = (User, message = '', code = 6) => {
	const pushObject = {
		message: message,
		notification_code: code,
		body: User
	};
	apis.sendPush(pushObject, User.user_id);
};